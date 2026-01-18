import { getCurrentMonster } from '../game/monsters.js';

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

function getCookie(request, name) {
    const cookieString = request.headers.get('Cookie') || '';
    const cookie = cookieString.split(';').find(c => c.trim().startsWith(name + '='));
    return cookie ? decodeURI(cookie.split('=')[1]) : null;
}

export async function onRequestGet(context) {
    const { request, env } = context;
    const { DB } = env;

    try {
        await runMigrations(DB);
        const sessionId = getCookie(request, 'session_id');
        if (!sessionId) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });

        const session = await DB.prepare('SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime("now")').bind(sessionId).first();
        if (!session) return new Response(JSON.stringify({ error: "Invalid or expired session" }), { status: 401 });

        let dbUser = await DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first();
        if (!dbUser) return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });

        // --- Stat Integrity Check and Recalculation ---
        const correctStats = {
            ap: dbUser.str * 5,
            hp: 50 + (dbUser.str * 10),
            crit_rate: 0.05 + (dbUser.dex * 0.005),
            evasion_rate: 0.0 + (dbUser.dex * 0.002),
        };
        correctStats.dps = correctStats.ap * dbUser.attack_speed * (1 + correctStats.crit_rate * dbUser.crit_damage);

        const statsToUpdate = {};
        for (const [key, value] of Object.entries(correctStats)) {
            if (dbUser[key] !== value) {
                statsToUpdate[key] = value;
            }
        }

        if (Object.keys(statsToUpdate).length > 0) {
            const setClauses = Object.keys(statsToUpdate).map(key => `${key} = ?`).join(', ');
            const values = Object.values(statsToUpdate);
            await DB.prepare(`UPDATE users SET ${setClauses} WHERE id = ?`).bind(...values, dbUser.id).run();
            dbUser = await DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first();
        }
        
        await DB.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').bind(dbUser.id).run();

        // Get current monster based on user's progress
        const monster = getCurrentMonster(dbUser);

        const { google_id, ...characterData } = dbUser;
        const responsePayload = {
            user: { id: dbUser.id, email: dbUser.email, name: dbUser.name, picture: dbUser.picture },
            character: characterData,
            monster: monster // Include monster data in the response
        };

        return new Response(JSON.stringify(responsePayload), { headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        console.error("Critical error in /api/me:", error);
        return new Response(JSON.stringify({ error: "An internal server error occurred.", details: error.message }), { status: 500 });
    }
}
