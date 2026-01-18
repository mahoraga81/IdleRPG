// functions/api/upgrade.js

/**
 * 강화 비용 계산 함수
 * @param {number} level - 현재 스탯 레벨
 * @returns {number} - 다음 레벨업에 필요한 골드
 */
function getUpgradeCost(level) {
    // 기본 비용 10, 레벨이 오를수록 비용이 15%씩 복리로 증가
    return Math.floor(10 * Math.pow(1.15, level - 1));
}

/**
 * 쿠키에서 세션 ID를 가져오는 헬퍼 함수
 */
function getCookie(request, name) {
    const cookieString = request.headers.get('Cookie') || '';
    const cookie = cookieString.split(';').find(c => c.trim().startsWith(name + '='));
    return cookie ? decodeURI(cookie.split('=')[1]) : null;
}

/**
 * API 요청 핸들러 (POST)
 */
export async function onRequestPost(context) {
    const { request, env } = context;
    const { DB } = env;

    try {
        // 1. 사용자 인증
        const sessionId = getCookie(request, 'session_id');
        if (!sessionId) {
            return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
        }
        const session = await DB.prepare('SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime("now")').bind(sessionId).first();
        if (!session) {
            return new Response(JSON.stringify({ error: "Invalid or expired session" }), { status: 401 });
        }

        // 2. 요청 본문에서 강화할 스탯 파싱
        const { stat } = await request.json();
        const validStats = ['str', 'dex']; // 강화 가능한 스탯 목록
        if (!validStats.includes(stat)) {
            return new Response(JSON.stringify({ error: "Invalid stat for upgrade" }), { status: 400 });
        }

        // 3. 현재 사용자 정보 및 스탯 레벨 조회
        const user = await DB.prepare(`SELECT id, gold, ${stat} FROM users WHERE id = ?`).bind(session.user_id).first();
        if (!user) {
            return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
        }

        // 4. 강화 비용 계산 및 골드 확인
        const currentLevel = user[stat];
        const cost = getUpgradeCost(currentLevel);

        if (user.gold < cost) {
            return new Response(JSON.stringify({ error: "Not enough gold" }), { status: 400 });
        }

        // 5. DB 업데이트: 골드 차감 및 스탯 증가
        const newLevel = currentLevel + 1;
        // 여러 쿼리를 하나로 묶어 실행 (더 효율적)
        await DB.prepare(
            `UPDATE users SET gold = gold - ?, ${stat} = ? WHERE id = ?`
        ).bind(cost, newLevel, user.id).run();
        
        // 6. 파생 스탯 재계산 및 업데이트 (중요)
        const updatedUser = await DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
        const newAp = updatedUser.str * 5; // 힘 1당 공격력 5
        const newHp = 50 + (updatedUser.str * 10); // 힘 1당 체력 10
        const newCritRate = 0.05 + (updatedUser.dex * 0.005); // 민첩 1당 치명타 확률 0.5%
        const newEvasionRate = 0.0 + (updatedUser.dex * 0.002); // 민첩 1당 회피율 0.2%
        const newDps = newAp * updatedUser.attack_speed * (1 + newCritRate * updatedUser.crit_damage);

        await DB.prepare(
            'UPDATE users SET ap = ?, hp = ?, crit_rate = ?, evasion_rate = ?, dps = ? WHERE id = ?'
        ).bind(newAp, newHp, newCritRate, newEvasionRate, newDps, user.id).run();

        // 7. 최종 업데이트된 캐릭터 정보 조회 및 반환
        const finalCharacter = await DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
        const { google_id, ...characterData } = finalCharacter;

        return new Response(JSON.stringify({
            message: `Successfully upgraded ${stat.toUpperCase()}!`,
            character: characterData
        }), { headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error("Error in /api/upgrade:", error);
        return new Response(JSON.stringify({ error: "Internal server error", details: error.message }), { status: 500 });
    }
}
