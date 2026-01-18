async function runMigrations(DB) {
    try {
        console.log("Checking database migrations...");
        const migrations = {
            '20240101_initial_setup': `
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
                CREATE TABLE sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );
            `,
            '20240102_add_stage_and_login_tracking': `
                ALTER TABLE users ADD COLUMN current_stage INTEGER NOT NULL DEFAULT 1;
                ALTER TABLE users ADD COLUMN last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
            `,
            '20240103_add_stage_progress': `
                ALTER TABLE users ADD COLUMN stage_progress INTEGER NOT NULL DEFAULT 0;
            `
        };

        // migrations 테이블 확인 및 생성
        const migrationTable = await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'").first();
        if (!migrationTable) {
            await DB.prepare("CREATE TABLE migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)").run();
        }

        const appliedMigrations = await DB.prepare("SELECT id FROM migrations").all();
        const appliedIds = appliedMigrations.results.map(row => row.id);

        for (const id of Object.keys(migrations).sort()) {
            if (!appliedIds.includes(id)) {
                console.log(`Applying migration: ${id}...`);
                const statements = migrations[id].trim().split(';').filter(s => s.trim().length > 0);
                const batch = statements.map(stmt => DB.prepare(stmt));
                await DB.batch(batch);
                await DB.prepare("INSERT INTO migrations (id) VALUES (?)").bind(id).run();
                console.log(`Migration ${id} applied successfully.`);
            }
        }

    } catch (error) {
        console.error("Failed to run database migrations:", error);
        // In a real-world scenario, you might want to prevent the app from starting.
        throw new Error(`Database migration failed: ${error.message}`);
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
        // 데이터베이스 마이그레이션을 먼저 실행합니다.
        await runMigrations(DB);

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
        
        // 마지막 로그인 시간을 지금으로 업데이트합니다.
        await DB.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').bind(session.user_id).run();

        // 먼저 사용자 정보를 조회하여 dps를 계산합니다.
        const dbUser = await DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first();
        if (!dbUser) {
            return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
        }
        
        // 서버에서 항상 최신 DPS를 계산하여 업데이트합니다.
        const calculatedDps = dbUser.ap * dbUser.attack_speed * (1 + dbUser.crit_rate * dbUser.crit_damage);
        if (dbUser.dps !== calculatedDps) {
            await DB.prepare('UPDATE users SET dps = ? WHERE id = ?').bind(calculatedDps, dbUser.id).run();
            dbUser.dps = calculatedDps;
        }

        // 모든 사용자 데이터를 character 객체에 포함하여 반환합니다.
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
