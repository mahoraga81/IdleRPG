
// Helper function to parse cookies from the request headers
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

    const sessionId = getCookie(request, 'session_id');

    if (!sessionId) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    // Using a JOIN to fetch session and user data in one go could be more efficient,
    // but for clarity, we'll keep it as two separate queries for now.

    const sessionQuery = 'SELECT user_id, expires_at FROM sessions WHERE id = ?';
    const sessionStmt = DB.prepare(sessionQuery).bind(sessionId);
    const session = await sessionStmt.first();

    if (!session) {
        return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    if (new Date(session.expires_at) < new Date()) {
        await DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
        return new Response(JSON.stringify({ error: "Session expired" }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const userQuery = 'SELECT * FROM users WHERE id = ?';
    const userStmt = DB.prepare(userQuery).bind(session.user_id);
    const dbUser = await userStmt.first();

    if (!dbUser) {
        return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    // Structure the data as the frontend expects it
    const responsePayload = {
        user: {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            picture: dbUser.picture
        },
        character: {
            level: dbUser.level,
            gold: dbUser.gold,
            str: dbUser.str,
            dex: dbUser.dex,
            hp: dbUser.hp, // 체력
            ap: dbUser.ap,   // 공격력
            def: dbUser.def, // 방어력
            crit_rate: dbUser.crit_rate, // 치명타 확률
            crit_damage: dbUser.crit_damage, // 치명타 피해량
            attack_speed: dbUser.attack_speed, // 공격 속도
            evasion_rate: dbUser.evasion_rate, // 회피 확률
            dps: dbUser.dps // 초당 데미지 (DPS)
        }
    };
    
    return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}
