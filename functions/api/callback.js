async function ensureSchema(DB) {
    try {
        let needsUpdate = false;
        const usersTable = await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").first();
        
        if (!usersTable) {
            needsUpdate = true;
        } else {
            const columns = await DB.prepare("PRAGMA table_info(users)").all();
            const hasDpsColumn = columns.results.some(col => col.name === 'dps');
            if (!hasDpsColumn) {
                needsUpdate = true;
                 console.log("'dps' column not found. Schema requires update.");
            }
        }

        if (needsUpdate) {
            console.log("Database schema is outdated or missing. Re-initializing...");

            const batch = [
                DB.prepare("DROP TABLE IF EXISTS sessions"),
                DB.prepare("DROP TABLE IF EXISTS users"),
                DB.prepare(`
                    CREATE TABLE users (
                        id TEXT PRIMARY KEY,
                        email TEXT NOT NULL,
                        name TEXT NOT NULL,
                        picture TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        level INTEGER NOT NULL DEFAULT 1,
                        gold INTEGER NOT NULL DEFAULT 10,
                        str INTEGER NOT NULL DEFAULT 1,
                        dex INTEGER NOT NULL DEFAULT 1,
                        hp INTEGER NOT NULL DEFAULT 50,
                        ap INTEGER NOT NULL DEFAULT 5,
                        def INTEGER NOT NULL DEFAULT 0,
                        crit_rate REAL NOT NULL DEFAULT 0.05,
                        crit_damage REAL NOT NULL DEFAULT 1.5,
                        attack_speed REAL NOT NULL DEFAULT 1.0,
                        evasion_rate REAL NOT NULL DEFAULT 0.0,
                        dps REAL NOT NULL DEFAULT 5.0
                    );
                `),
                DB.prepare(`
                    CREATE TABLE sessions (
                        id TEXT PRIMARY KEY,
                        user_id TEXT NOT NULL,
                        expires_at TEXT NOT NULL,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    );
                `)
            ];
            
            await DB.batch(batch);
            console.log("Database schema initialized successfully.");
        }
    } catch (error) {
        console.error("Failed to initialize database schema:", error);
        throw new Error(`Database setup failed: ${error.message}`);
    }
}


export async function onRequestGet(context) {
    const { request, env } = context;
    const { DB, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = env;

    const url = new URL(request.url);
    const code = url.searchParams.get('code');

    if (!code) {
        return new Response("Missing authorization code", { status: 400 });
    }

    try {
        // **CRITICAL FIX**: Ensure the database schema is up-to-date before any operation.
        await ensureSchema(DB);

        // 1. Exchange authorization code for access token
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: url.origin + url.pathname, 
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

        // 3. Atomically create or update user
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

        await DB.prepare(upsertQuery).bind(userId, userEmail, userName, userPicture).run();
        
        // 4. Create a session for the user
        const sessionId = crypto.randomUUID();
        const sessionExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        
        await DB.prepare(
            'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
        ).bind(sessionId, userId, sessionExpiry.toISOString()).run();

        // 5. Set session cookie and redirect to the main page
        const headers = new Headers();
        headers.append('Set-Cookie', `session_id=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${sessionExpiry.toUTCString()}`);
        headers.append('Location', '/');

        return new Response(null, { status: 302, headers });

    } catch (error) {
        console.error("Callback Error:", error);
        // Provide a more structured error response
        return new Response(JSON.stringify({ error: "An internal error occurred.", details: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' }});
    }
}
