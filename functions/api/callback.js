
// Helper function to introduce a delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to generate a secure random session ID using the Web Crypto API
const generateSessionId = () => {
    const array = new Uint8Array(24); // 24 bytes -> 32 chars in Base64URL
    crypto.getRandomValues(array);
    // Convert to a URL-safe Base64 string
    return btoa(String.fromCharCode.apply(null, array))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
};

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

        // 3. Check if user exists in D1, or create a new one, handling race conditions
        let user;
        const findUserResult = await safeQuery(DB, "SELECT * FROM users WHERE id = ?", [googleUser.id]);

        if (findUserResult.success && findUserResult.data.length > 0) {
            user = findUserResult.data[0];
        } else {
            // User does not exist, try to create them.
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

            if (createUserResult.success && createUserResult.data.length > 0) {
                // INSERT was successful
                user = createUserResult.data[0];
            } else {
                // INSERT failed, likely due to a race condition. Wait for replication and retry SELECT.
                console.log("INSERT failed, likely a race condition. Waiting before retrying SELECT.", createUserResult.error);
                await sleep(250); // Wait for 250ms for DB replication
                const raceConditionSelectResult = await safeQuery(DB, "SELECT * FROM users WHERE id = ?", [googleUser.id]);
                
                if (raceConditionSelectResult.success && raceConditionSelectResult.data.length > 0) {
                    user = raceConditionSelectResult.data[0];
                } else {
                    // If the user *still* doesn't exist, something else is wrong.
                    throw new Error(`Database error: Could not create user, and could not find them after a failed insert. Original error: ${createUserResult.error}`);
                }
            }
        }

        // 4. Create a session
        const sessionId = generateSessionId();
        const sessionExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

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
            status: 302,
            headers: headers,
        });

    } catch (error) {
        console.error("Callback Error:", error);
        return new Response(error.toString(), { status: 500 });
    }
}
