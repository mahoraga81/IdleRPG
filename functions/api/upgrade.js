
async function handleStatUpgrade(DB, user, stat) {
    const getUpgradeCost = (level) => Math.floor(10 * Math.pow(1.15, level - 1));

    const currentLevel = user[stat];
    if (typeof currentLevel !== 'number') {
        throw new Error(`Invalid stat: ${stat}`);
    }
    
    const cost = getUpgradeCost(currentLevel);
    if (user.gold < cost) {
        throw new Error("Not enough gold");
    }

    // 1. 골드 차감 및 스탯 레벨업
    user.gold -= cost;
    user[stat] += 1;

    // 2. 파생 스탯 재계산
    user.ap = user.str * 5;
    user.hp = 50 + (user.str * 10);
    user.crit_rate = 0.05 + (user.dex * 0.005);
    user.evasion_rate = 0.0 + (user.dex * 0.002);
    user.dps = user.ap * user.attack_speed * (1 + user.crit_rate * user.crit_damage);

    // 3. 데이터베이스 업데이트
    const setClauses = 'gold = ?, str = ?, dex = ?, ap = ?, hp = ?, crit_rate = ?, evasion_rate = ?, dps = ?';
    const values = [user.gold, user.str, user.dex, user.ap, user.hp, user.crit_rate, user.evasion_rate, user.dps, user.id];
    
    await DB.prepare(`UPDATE users SET ${setClauses} WHERE id = ?`).bind(...values).run();

    const { google_id, ...characterData } = user;
    return characterData;
}


export async function onRequestPost(context) {
    const { request, env } = context;
    const { DB } = env;

    const getCookie = (name) => {
        const cookieString = request.headers.get('Cookie') || '';
        const cookie = cookieString.split(';').find(c => c.trim().startsWith(name + '='));
        return cookie ? decodeURI(cookie.split('=')[1]) : null;
    };

    try {
        const sessionId = getCookie('session_id');
        if (!sessionId) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });

        const session = await DB.prepare('SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime("now")').bind(sessionId).first();
        if (!session) return new Response(JSON.stringify({ error: "Invalid or expired session" }), { status: 401 });

        const user = await DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first();
        if (!user) return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });

        const { stat } = await request.json();
        if (!['str', 'dex'].includes(stat)) {
            return new Response(JSON.stringify({ error: "Invalid stat type" }), { status: 400 });
        }

        const updatedCharacter = await handleStatUpgrade(DB, user, stat);

        return new Response(JSON.stringify({ character: updatedCharacter }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error("Upgrade API error:", error);
        return new Response(JSON.stringify({ error: "An internal server error occurred.", details: error.message }), { status: 500 });
    }
}
