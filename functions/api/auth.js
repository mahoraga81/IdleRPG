import { Router } from 'itty-router';
import { jsonResponse } from './utils';
import { SignJWT } from 'jose';
import { nanoid } from 'nanoid';

const authRouter = Router({ base: '/api/auth' });

const JWT_COOKIE_NAME = 'jwt-token';

// 1. Redirect to Google for authentication
authRouter.get('/google/login', (request, env) => {
  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set('redirect_uri', env.REDIRECT_URL);
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email');
  googleAuthUrl.searchParams.set('access_type', 'offline');
  googleAuthUrl.searchParams.set('prompt', 'select_account');

  // Redirect the user to Google's OAuth 2.0 server
  return Response.redirect(googleAuthUrl.toString(), 302);
});

// 2. Handle the callback from Google
authRouter.get('/google/callback', async (request, env) => {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return jsonResponse({ message: 'Authorization code is missing' }, 400);
  }

  try {
    // Exchange authorization code for an access token
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

    // Use access token to get user profile
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userResponse.json();
    const userId = userData.id; // This is the unique Google User ID

    // Check if user exists, if not, create them
    let player = await env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(userId).first();
    if (!player) {
        // Create new player with default stats
        await env.DB.prepare(
            `INSERT INTO players (id, gold, stage, stats_maxHp, stats_attack, stats_defense, stats_critRate, stats_critDamage, stats_attackSpeed, stats_evasion) VALUES (?, 100, 1, 100, 10, 5, 5, 50, 1, 5)`
        ).bind(userId).run();
    }
    
    // Generate a new unique session ID for multi-device control
    const sessionId = nanoid();

    // Update the session ID in the database
    await env.DB.prepare('UPDATE players SET session_token_id = ? WHERE id = ?').bind(sessionId, userId).run();

    // Create JWT
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const jwt = await new SignJWT({ email: userData.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setJti(sessionId) // JWT ID, used for session tracking
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(secret);

    // Set JWT in an HttpOnly cookie and redirect to the main page
    const headers = new Headers();
    headers.append('Set-Cookie', `${JWT_COOKIE_NAME}=${jwt}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`);
    headers.append('Location', '/');
    
    return new Response(null, { status: 302, headers });

  } catch (e) {
    console.error('Callback Error:', e.stack);
    return jsonResponse({ message: 'An error occurred during authentication', error: e.message }, 500);
  }
});

// 3. Handle logout
authRouter.post('/logout', async (request, env) => {
  // This requires the authMiddleware to have run first to get the userId
  // We can manually add it or refactor router to ensure it runs.
  // For now, let's assume we can get the user from a valid token.
  
  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) {
      const cookies = Object.fromEntries(cookieHeader.split(';').map(c => c.trim().split('=').map(decodeURIComponent)));
      const token = cookies[JWT_COOKIE_NAME];
      if(token) {
        try {
            const secret = new TextEncoder().encode(env.JWT_SECRET);
            // We don't need to fully verify, just decode to get the user ID
            const { payload } = await jwtVerify(token, secret, { ignoreExpiration: true }); 
            if(payload.sub) {
                 await env.DB.prepare('UPDATE players SET session_token_id = NULL WHERE id = ?').bind(payload.sub).run();
            }
        } catch(e) {
            // Ignore if token is invalid, we are logging out anyway
        }
      }
  }

  const headers = new Headers();
  headers.append('Set-Cookie', `${JWT_COOKIE_NAME}=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0`); // Expire the cookie
  return jsonResponse({ message: 'Logged out' }, 200, { headers });
});


export { authRouter };
