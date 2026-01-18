async function runMigrations(DB) {
    try {
        const migrations = {
            '20240101_initial_setup': `
                CREATE TABLE users (
                    id TEXT PRIMARY KEY,
                    google_id TEXT UNIQUE,
                    email TEXT NOT NULL,
                    name TEXT NOT NULL,
                    picture TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    level INTEGER NOT NULL DEFAULT 1,
                    gold INTEGER NOT NULL DEFAULT 10,
                    str INTEGER NOT NULL DEFAULT 1,
                    dex INTEGER NOT NULL DEFAULT 1,
                    hp INTEGER NOT NULL DEFAULT 60,
                    ap INTEGER NOT NULL DEFAULT 5,
                    crit_rate REAL NOT NULL DEFAULT 0.055,
                    crit_damage REAL NOT NULL DEFAULT 1.5,
                    attack_speed REAL NOT NULL DEFAULT 1.0,
                    evasion_rate REAL NOT NULL DEFAULT 0.002,
                    dps REAL NOT NULL DEFAULT 5.41
                );
                CREATE TABLE sessions ( id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE );
            `,
            '20240102_add_stage_and_login_tracking': `
                ALTER TABLE users ADD COLUMN current_stage INTEGER NOT NULL DEFAULT 1;
                ALTER TABLE users ADD COLUMN last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
            `,
            '20240103_add_stage_progress': `
                ALTER TABLE users ADD COLUMN stage_progress INTEGER NOT NULL DEFAULT 0;
            `
        };
        const migrationTable = await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'").first();
        if (!migrationTable) {
            await DB.prepare("CREATE TABLE migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)").run();
        }
        const appliedMigrations = await DB.prepare("SELECT id FROM migrations").all();
        const appliedIds = appliedMigrations.results.map(row => row.id);
        for (const id of Object.keys(migrations).sort()) {
            if (!appliedIds.includes(id)) {
                const statements = migrations[id].trim().split(';').filter(s => s.trim().length > 0);
                const batch = statements.map(stmt => DB.prepare(stmt));
                await DB.batch(batch);
                await DB.prepare("INSERT INTO migrations (id) VALUES (?)").bind(id).run();
            }
        }
    } catch (error) {
        console.error("Failed to run database migrations:", error);
        throw new Error(`Database migration failed: ${error.message}`);
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
        // Use the consistent migration logic instead of the old schema function
        await runMigrations(DB);

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
        // IMPORTANT: The google_id from user info is the primary key for our logic.
        const googleId = userData.id;

        const upsertQuery = `
            INSERT INTO users (id, google_id, email, name, picture)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(google_id) DO UPDATE SET
                email = excluded.email,
                name = excluded.name,
                picture = excluded.picture;
        `;
        // Note: The user's primary key (`id`) is the google_id in our new schema
        await DB.prepare(upsertQuery).bind(googleId, googleId, userData.email, userData.name, userData.picture).run();

        // 4. Create a session for the user
        const sessionId = crypto.randomUUID();
        const sessionExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        
        await DB.prepare(
            'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
        ).bind(sessionId, googleId, sessionExpiry.toISOString()).run();

        // 5. Set session cookie and redirect to the main page
        const headers = new Headers();
        headers.append('Set-Cookie', `session_id=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${sessionExpiry.toUTCString()}`);
        headers.append('Location', '/');

        return new Response(null, { status: 302, headers });

    } catch (error) {
        console.error("Callback Error:", error);
        return new Response(JSON.stringify({ error: "An internal error occurred.", details: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' }});
    }
}
