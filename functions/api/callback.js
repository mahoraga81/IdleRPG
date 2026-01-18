
import { nanoid } from 'nanoid';

// Helper function to handle database queries
async function safeQuery(db, query, params = []) {
    try {
        const stmt = db.prepare(query).bind(...params);
        const result = await stmt.all();
        return { success: true, data: result };
    } catch (e) {
        console.error("Database Error:", e);
        return { success: false, error: e.message };
    }
}


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

        // 3. Check if user exists in D1, or create a new one
        let user;
        const findUserResult = await safeQuery(DB, "SELECT * FROM users WHERE id = ?", [googleUser.id]);

        if (findUserResult.success && findUserResult.data.length > 0) {
            // User exists
            user = findUserResult.data[0];
        } else {
            // New user, create one with default stats
            const newUser = {
                id: googleUser.id,
                email: googleUser.email,
                name: googleUser.name,
                picture: googleUser.picture,
            };
            const createUserResult = await safeQuery(
                DB,
                "INSERT INTO users (id, email, name, picture) VALUES (?, ?, ?, ?) RETURNING *",
                [newUser.id, newUser.email, newUser.name, newUser.picture]
            );

            if (!createUserResult.success) {
                 throw new Error('Failed to create new user in database.');
            }
            // The user is created with default values from the table schema
            const getNewUser = await safeQuery(DB, "SELECT * FROM users WHERE id = ?", [newUser.id]);
            if(getNewUser.success && getNewUser.data.length > 0) {
                 user = getNewUser.data[0];
            } else {
                 throw new Error('Failed to retrieve the newly created user.');
            }
        }

        // 4. Create a session
        const sessionId = nanoid(32); // Generate a secure random session ID
        const sessionExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

        await safeQuery(
            DB,
            "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
            [sessionId, user.id, sessionExpires.toISOString()]
        );
        
        // 5. Set session cookie and redirect to the main page
        const headers = new Headers();
        headers.append('Set-Cookie', `session_id=${sessionId}; HttpOnly; Secure; Path=/; Expires=${sessionExpires.toUTCString()}`);
        headers.append('Location', '/');
        
        return new Response(null, {
            status: 302, // Found (redirect)
            headers: headers,
        });

    } catch (error) {
        console.error("Callback Error:", error);
        return new Response(error.toString(), { status: 500 });
    }
}

