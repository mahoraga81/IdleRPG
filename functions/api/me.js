async function ensureSchema(DB) {
    try {
        // sqlite_master 테이블을 쿼리하여 'users' 테이블이 존재하는지 확인합니다.
        const usersTable = await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").first();
        
        if (usersTable) {
            // 테이블이 이미 존재하면 아무 작업도 하지 않고 함수를 종료합니다.
            return;
        }

        console.log("Database schema not found. Initializing...");

        // 테이블이 없으면, users와 sessions 테이블을 생성하는 배치 작업을 실행합니다.
        const batch = [
            // 만약을 위해 기존 테이블을 삭제하는 구문을 포함합니다. (오류 방지)
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

    } catch (error) {
        console.error("Failed to initialize database schema:", error);
        // 오류 발생 시, 더 상위의 호출자에게 에러를 전파하여 처리하도록 합니다.
        throw new Error(`Database setup failed: ${error.message}`);
    }
}

function getCookie(request, name) {
    let result = null;
    const cookieString = request.headers.get('Cookie');
    if (cookieString) {
        const cookies = cookieString.split(';');
        cookies.forEach(cookie => {
            const parts = cookie.split('=');
            const key = parts.shift().trim();
            if (key === name) {
                result = decodeURI(parts.join('='));
            }
        });
    }
    return result;
}

export async function onRequestGet(context) {
    const { request, env } = context;
    const { DB } = env;

    try {
        // **CRITICAL FIX**: API 요청 처리 전에 데이터베이스 스키마 존재를 보장합니다.
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
            // This case might happen if a user is deleted but the session remains.
            return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
        }

        const responsePayload = {
            user: { id: dbUser.id, email: dbUser.email, name: dbUser.name, picture: dbUser.picture },
            character: { ...dbUser } // 모든 스탯을 포함하여 character 객체를 채웁니다.
        };

        return new Response(JSON.stringify(responsePayload), { headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error("Critical error in /api/me:", error.message);
        return new Response(JSON.stringify({ error: "An internal server error occurred.", details: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
