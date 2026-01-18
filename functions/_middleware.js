
import { Router } from 'itty-router';
import { json, error } from 'itty-router-extras';
import { SignJWT, jwtVerify } from 'jose';
import { nanoid } from 'nanoid';

// Reusable response helpers
const jsonResponse = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
});

// Helper to return a detailed HTML error page
const htmlErrorResponse = (title, errorDetails) => {
    const body = `
        <body style="font-family: sans-serif; background-color: #1a1a1a; color: #f2f2f2; padding: 2em;">
            <h1 style="color: #ff4d4d;">OAuth Error: ${title}</h1>
            <p>There was a critical error during the Google login process.</p>
            <h3 style="color: #ffb3b3;">Error Details:</h3>
            <pre style="background-color: #333; padding: 1em; border-radius: 8px; white-space: pre-wrap; word-wrap: break-word;">${JSON.stringify(errorDetails, null, 2)}</pre>
            <p><b>Next Steps:</b></p>
            <ol>
                <li>Please copy the complete content of the "Error Details" block above.</li>
                <li>Paste this information in your communication with the AI assistant.</li>
                <li>This information is crucial for diagnosing the problem.</li>
            </ol>
        </body>
    `;
    return new Response(body, {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
};


const JWT_COOKIE_NAME = 'jwt-token';

// ========== AUTHENTICATION MIDDLEWARE ==========
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
        
        const storedSession = await env.DB.prepare('SELECT session_token_id FROM players WHERE id = ?').bind(payload.sub).first('session_token_id');
        if (storedSession !== payload.jti) {
            return error(401, 'Unauthorized: Session expired. Please log in again.');
        }

        request.userId = payload.sub;
        request.sessionId = payload.jti;

    } catch (err) {
        console.error("Auth Middleware Error:", err);
        return error(401, 'Unauthorized: Invalid or expired token');
    }
};


// ========== ROUTER DEFINITIONS ==========

// 1. Auth Router (No authMiddleware needed here)
const authRouter = Router({ base: '/api/auth' });

authRouter.get('/google/login', (request, env) => {
  // Use the exact redirect URL from the environment variable
  const redirectUri = env.REDIRECT_URL;

  if (!redirectUri) {
      return htmlErrorResponse('Configuration Error', {
          message: "The REDIRECT_URL environment variable is not set in the Cloudflare Worker.",
          details: "Please ask the developer to configure this setting in the Cloudflare dashboard."
      });
  }

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email');
  googleAuthUrl.searchParams.set('access_type', 'offline');
  googleAuthUrl.searchParams.set('prompt', 'select_account');
  return Response.redirect(googleAuthUrl.toString(), 302);
});

authRouter.get('/google/callback', async (request, env) => {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  // Use the exact redirect URL from the environment variable
  const redirectUri = env.REDIRECT_URL;

  if (!redirectUri) {
      return htmlErrorResponse('Configuration Error', {
          message: "The REDIRECT_URL environment variable is not set in the Cloudflare Worker.",
          details: "This should not happen if the login step worked. Please contact support."
      });
  }

  if (!code) {
    return htmlErrorResponse('Authorization Code Missing', {
        message: "Google did not return an authorization code.",
        details: "This can happen if you deny the permission request on the Google consent screen."
    });
  }

  try {
    const tokenRequestBody = {
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
    };

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tokenRequestBody),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
        return htmlErrorResponse(
            'Failed to Retrieve Access Token',
            {
                reason: "Google's token endpoint returned an error.",
                statusCode: tokenResponse.status,
                errorResponse: tokenData,
                originalRequest: tokenRequestBody
            }
        );
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
    return htmlErrorResponse('Unhandled Callback Error', {
        message: e.message,
        stack: e.stack,
    });
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

  const player = await env.DB.prepare('SELECT gold, ?? as statLevel FROM players WHERE id = ?').bind(stat, userId).first();

  if (!player) {
    return jsonResponse({ message: 'Player not found' }, 404);
  }
  
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
export const onRequest = async (context) => {
  const { request, next, env } = context;
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) {
    return Router()
      .all('/api/auth/*', authRouter.handle)
      .all('/api/player/*', playerRouter.handle)
      .handle(request, env)
      .catch((err) => {
        console.error("Router Error:", err);
        return error(500, "Internal Server Error");
      });
  }
  
  return next();
};
