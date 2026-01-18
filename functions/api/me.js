async function ensureSchema(DB) {
    try {
        let needsUpdate = false;
        // 1. users 테이블의 존재 여부 확인
        const usersTable = await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").first();
        
        if (!usersTable) {
            needsUpdate = true;
        } else {
            // 2. 테이블이 존재하면, 스키마가 최신인지 (예: 'dps' 컬럼이 있는지) 확인
            const columns = await DB.prepare("PRAGMA table_info(users)").all();
            const hasDpsColumn = columns.results.some(col => col.name === 'dps');
            if (!hasDpsColumn) {
                needsUpdate = true;
                 console.log("'dps' column not found. Schema requires update.");
            }
        }

        // 3. 스키마가 구식이거나 존재하지 않으면, 전체를 다시 빌드
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

function getCookie(request, name) {
    const cookieString = request.headers.get('Cookie') || '';
    const cookie = cookieString.split(';').find(c => c.trim().startsWith(name + '='));
    if (cookie) {
        return decodeURI(cookie.split('=')[1]);
    }
    return null;
}

export async function onRequestGet(context) {
    const { request, env } = context;
    const { DB } = env;

    try {
        await ensureSchema(DB);

        const sessionId = getCookie(request, 'session_id');
        if (!sessionId) {
            return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
        }

        const session = await DB.prepare('SELECT user_id, expires_at FROM sessions WHERE id = ?').bind(sessionId).first();
        if (!session) {
            return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401 });
        }

        if (new Date(session.expires_at) < new Date()) {
            await DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
            return new Response(JSON.stringify({ error: "Session expired" }), { status: 401 });
        }

        const dbUser = await DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first();
        if (!dbUser) {
            return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
        }
        
        // 모든 사용자 데이터를 character 객체에 포함하여 반환
        const responsePayload = {
            user: { id: dbUser.id, email: dbUser.email, name: dbUser.name, picture: dbUser.picture },
            character: { ...dbUser }
        };

        return new Response(JSON.stringify(responsePayload), { headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error("Critical error in /api/me:", error.message);
        return new Response(JSON.stringify({ error: "An internal server error occurred.", details: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
