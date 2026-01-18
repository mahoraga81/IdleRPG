
// Helper function to generate a secure random session ID using the Web Crypto API
const generateSessionId = () => {
    const array = new Uint8Array(24);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode.apply(null, array)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const code = url.searchParams.get("code");

    if (!code) {
        return new Response("Missing code parameter", { status: 400 });
    }

    try {
        const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, DB } = env;

        // 1. Exchange code for access token
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code: code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: GOOGLE_REDIRECT_URI,
                grant_type: "authorization_code",
            }),
        });
        const tokenData = await tokenResponse.json();
        if (!tokenData.access_token) {
            throw new Error(`Failed to fetch token: ${JSON.stringify(tokenData)}`);
        }

        // 2. Fetch user info from Google
        const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const googleUser = await userResponse.json();
        if (!googleUser.id) {
            throw new Error(`Failed to fetch user info: ${JSON.stringify(googleUser)}`);
        }

        // 3. Atomically UPSERT (Insert or Update) the user in the database.
        // This is the robust solution to race conditions and replication lag.
        const upsertQuery = `
            INSERT INTO users (id, email, name, picture)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                email = excluded.email,
                picture = excluded.picture
            RETURNING *;
        `;

        const stmt = DB.prepare(upsertQuery).bind(googleUser.id, googleUser.email, googleUser.name, googleUser.picture);
        const result = await stmt.all();

        if (!result || !result.results || result.results.length === 0) {
            throw new Error("Critical Database Error: UPSERT operation failed to return user data.");
        }
        const user = result.results[0];

        // 4. Create a session
        const sessionId = generateSessionId();
        const sessionExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        await DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
                  .bind(sessionId, user.id, sessionExpires.toISOString())
                  .run();
        
        // 5. Set session cookie and redirect to the main page
        const headers = new Headers();
        headers.append('Set-Cookie', `session_id=${sessionId}; HttpOnly; Secure; Path=/; Expires=${sessionExpires.toUTCString()}`);
        headers.append('Location', '/');
        
        return new Response(null, {
            status: 302,
            headers: headers,
        });

    } catch (error) {
        console.error("Callback Error:", error, error.cause);
        return new Response(error.toString(), { status: 500 });
    }
}
