export async function onRequestGet(context) {
    const { env } = context;
    const { DB } = env;

    try {
        console.log("Initializing database schema...");

        // Using batch API for multiple statements
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
        return new Response("Database setup complete. You can now log in.", { status: 200 });

    } catch (error) {
        console.error("Database setup failed:", error);
        return new Response(`Database setup failed: ${error.message}`, { status: 500 });
    }
}
