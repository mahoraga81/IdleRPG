
import { Router } from 'itty-router';
import { json, error } from 'itty-router-extras';
import { SignJWT, jwtVerify } from 'jose';
import { nanoid } from 'nanoid';

// Reusable response helpers
const jsonResponse = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
});

const JWT_COOKIE_NAME = 'jwt-token';

// ========== AUTHENTICATION MIDDLEWARE ==========
// This middleware will be applied to specific routes that need protection
const authMiddleware = async (request, env) => {
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader || !cookieHeader.includes(JWT_COOKIE_NAME)) {
        return error(401, 'Unauthorized: Missing token');
    }

    const cookies = Object.fromEntries(cookieHeader.split(';').map(c => c.trim().split('=').map(decodeURIComponent)));
    const token = cookies[JWT_COOKIE_NAME];

    if (!token) {
        return error(401, 'Unauthorized: Missing token');
    }

    try {
        const secret = new TextEncoder().encode(env.JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);

        if (!payload.sub || !payload.jti) {
            return error(401, 'Unauthorized: Invalid token payload');
        }
        
        // Check if the session is still valid
        const storedSession = await env.DB.prepare('SELECT session_token_id FROM players WHERE id = ?').bind(payload.sub).first('session_token_id');
        if (storedSession !== payload.jti) {
            // If the session ID in the DB does not match the one in the token, this token is for an old session.
            return error(401, 'Unauthorized: Session expired. Please log in again.');
        }

        // Attach userId and sessionId to the request object for later use
        request.userId = payload.sub;
        request.sessionId = payload.jti;

    } catch (err) {
        console.error("Auth Middleware Error:", err);
        // If token is expired, invalid, etc.
        return error(401, 'Unauthorized: Invalid or expired token');
    }
};


// ========== ROUTER DEFINITIONS ==========

// 1. Auth Router (No authMiddleware needed here)
const authRouter = Router({ base: '/api/auth' });

authRouter.get('/google/login', (request, env) => {
  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set('redirect_uri', env.REDIRECT_URL);
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email');
  googleAuthUrl.searchParams.set('access_type', 'offline');
  googleAuthUrl.searchParams.set('prompt', 'select_account');
  return Response.redirect(googleAuthUrl.toString(), 302);
});

authRouter.get('/google/callback', async (request, env) => {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return jsonResponse({ message: 'Authorization code is missing' }, 400);
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.REDIRECT_URL,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
        console.error("OAuth Error:", tokenData);
        return jsonResponse({ message: 'Failed to retrieve access token from Google'}, 500);
    }

    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userResponse.json();
    const userId = userData.id;

    let player = await env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(userId).first();
    if (!player) {
        await env.DB.prepare(
            `INSERT INTO players (id, gold, stage, stats_maxHp, stats_attack, stats_defense, stats_critRate, stats_critDamage, stats_attackSpeed, stats_evasion) VALUES (?, 100, 1, 100, 10, 5, 5, 50, 1, 5)`
        ).bind(userId).run();
    }
    
    const sessionId = nanoid();
    await env.DB.prepare('UPDATE players SET session_token_id = ? WHERE id = ?').bind(sessionId, userId).run();

    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const jwt = await new SignJWT({ email: userData.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setJti(sessionId)
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(secret);

    const headers = new Headers();
    headers.append('Set-Cookie', `${JWT_COOKIE_NAME}=${jwt}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`);
    headers.append('Location', '/');
    
    return new Response(null, { status: 302, headers });

  } catch (e) {
    console.error('Callback Error:', e.stack);
    return jsonResponse({ message: 'An error occurred during authentication', error: e.message }, 500);
  }
});

authRouter.post('/logout', async (request, env) => {
  const cookieHeader = request.headers.get('Cookie');
  let userId = null;

  if (cookieHeader) {
      const cookies = Object.fromEntries(cookieHeader.split(';').map(c => c.trim().split('=').map(decodeURIComponent)));
      const token = cookies[JWT_COOKIE_NAME];
      if (token) {
        try {
            const secret = new TextEncoder().encode(env.JWT_SECRET);
            // We only need the payload, don't need to fail on expiration
            const { payload } = await jwtVerify(token, secret, { ignoreExpiration: true });
            userId = payload.sub;
        } catch(e) { /* Ignore invalid token */ }
      }
  }
  
  if (userId) {
      await env.DB.prepare('UPDATE players SET session_token_id = NULL WHERE id = ?').bind(userId).run();
  }

  const headers = new Headers();
  headers.append('Set-Cookie', `${JWT_COOKIE_NAME}=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0`);
  headers.append('Location', '/'); // Redirect to home on logout
  return new Response(null, { status: 302, headers });
});

// 2. Player Router (Protected by authMiddleware)
const playerRouter = Router({ base: '/api/player' });

// Apply auth middleware to all routes in this router
playerRouter.all('*', authMiddleware);

playerRouter.get('/', async (request, env) => {
  const { userId } = request;
  const player = await env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(userId).first();
  if (!player) {
    return jsonResponse({ message: 'Player not found' }, 404);
  }
  return jsonResponse(player);
});

playerRouter.post('/upgrade', async (request, env) => {
  const { userId } = request;
  const { stat } = await request.json();

  if (!stat || !stat.startsWith('stats_')) {
    return jsonResponse({ message: 'Invalid stat provided.' }, 400);
  }

  // A transaction would be better, but for simplicity let's do checks first
  const player = await env.DB.prepare('SELECT gold, ?? as statLevel FROM players WHERE id = ?').bind(stat, userId).first();

  if (!player) {
    return jsonResponse({ message: 'Player not found' }, 404);
  }
  
  // Column names can't be bound directly, so we check the prefix
  const currentLevel = player[stat];
  const cost = 10 * Math.pow(1.1, currentLevel);

  if (player.gold < cost) {
    return jsonResponse({ message: 'Not enough gold' }, 400);
  }

  const newGold = player.gold - cost;
  const newLevel = currentLevel + 1;

  await env.DB.prepare(
    `UPDATE players SET gold = ?, ?? = ? WHERE id = ?`
  ).bind(newGold, stat, newLevel, userId).run();

  const updatedPlayer = await env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(userId).first();
  return jsonResponse(updatedPlayer);
});

// ========== MAIN MIDDLEWARE HANDLER ==========
// This is the entry point for all requests
export const onRequest = async (context) => {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // If the request is for an API route, let the router handle it
  if (url.pathname.startsWith('/api/')) {
    // Combine routers and handle the request
    return Router()
      .all('/api/auth/*', authRouter.handle)
      .all('/api/player/*', playerRouter.handle)
      .handle(request, env)
      .catch((err) => {
        console.error("Router Error:", err);
        return error(500, "Internal Server Error");
      });
  }
  
  // Otherwise, it's a request for a static asset, so let Pages handle it.
  return next();
};

