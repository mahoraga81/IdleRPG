
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
        return { success: true, data: result?.results || result }; // Adapt to different D1 return structures
    } catch (e) {
        console.error("Database Query Error:", { query: query, params: params, error: e.message });
        return { success: false, error: e }; // Return the full error object
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

        // 3. EAFP (Easier to Ask for Forgiveness than Permission) Approach
        let user;

        // First, just try to INSERT the user.
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
            // Happy path: The user was new, and the INSERT succeeded.
            user = createUserResult.data[0];
        } else {
            // INSERT failed. Check if it was a UNIQUE constraint violation (race condition).
            if (createUserResult.error?.message?.includes('UNIQUE constraint failed')) {
                console.log("Race condition detected. User likely exists. Fetching user.");

                // Retry SELECT with exponential backoff to handle replication lag.
                let userFound = false;
                const maxRetries = 5;
                for (let i = 0; i < maxRetries; i++) {
                    await sleep(200 * (i + 1)); // 200ms, 400ms, 600ms...
                    console.log(`Retry attempt #${i + 1}/${maxRetries}...`);
                    const retrySelectResult = await safeQuery(DB, "SELECT * FROM users WHERE id = ?", [googleUser.id]);
                    if (retrySelectResult.success && retrySelectResult.data.length > 0) {
                        user = retrySelectResult.data[0];
                        userFound = true;
                        console.log("User found on retry.");
                        break; // Exit loop
                    }
                }

                if (!userFound) {
                    throw new Error(`Critical Database Error: A user with ID ${googleUser.id} exists (proven by INSERT failure), but could not be retrieved after multiple retries.`);
                }
            } else {
                // The INSERT failed for a reason other than a race condition.
                throw new Error(`Failed to create user for a non-race-condition reason: ${createUserResult.error?.message}`);
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
