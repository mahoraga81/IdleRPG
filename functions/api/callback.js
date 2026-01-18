
// This function is the callback handler for Google OAuth
export async function onRequestGet(context) {
    const { request, env } = context;
    const { DB, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = env;

    const url = new URL(request.url);
    const code = url.searchParams.get('code');

    if (!code) {
        return new Response("Missing authorization code", { status: 400 });
    }

    try {
        // 1. Exchange authorization code for access token
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: url.origin + url.pathname, // Must match the one sent in /api/login
                grant_type: 'authorization_code',
            }),
        });

        const tokenData = await tokenResponse.json();
        if (tokenData.error) {
            console.error("Token Error:", tokenData.error_description);
            return new Response(`Error fetching token: ${tokenData.error_description}`, { status: 500 });
        }

        // 2. Use access token to get user profile
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const userData = await userResponse.json();

        // 3. Atomically create or update user with ALL stats
        const userId = userData.id;
        const userEmail = userData.email;
        const userName = userData.name;
        const userPicture = userData.picture;

        const upsertQuery = `
            INSERT INTO users (id, email, name, picture, level, gold, str, dex, hp, ap, def, crit_rate, crit_damage, attack_speed, evasion_rate, dps)
            VALUES (?, ?, ?, ?, 1, 10, 1, 1, 50, 5, 0, 0.05, 1.5, 1.0, 0.0, 5.0)
            ON CONFLICT(id) DO UPDATE SET
                email = excluded.email,
                name = excluded.name,
                picture = excluded.picture;
        `;

        await env.DB.prepare(upsertQuery).bind(userId, userEmail, userName, userPicture).run();
        
        // 4. **FIX**: Create a session for the user using the built-in crypto module
        const sessionId = crypto.randomUUID();
        const sessionExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        
        await env.DB.prepare(
            'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
        ).bind(sessionId, userId, sessionExpiry.toISOString()).run();

        // 5. Set session cookie and redirect to the main page
        const headers = new Headers();
        headers.append('Set-Cookie', `session_id=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${sessionExpiry.toUTCString()}`);
        headers.append('Location', '/');

        return new Response(null, { status: 302, headers });

    } catch (error) {
        console.error("Callback Error:", error);
        return new Response("An internal error occurred.", { status: 500 });
    }
}
