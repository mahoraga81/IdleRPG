import { getMonsterForStage } from '../game/monsters.js';

// 세션 쿠키를 파싱하는 헬퍼 함수
function getCookie(request, name) {
    const cookieString = request.headers.get('Cookie') || '';
    const cookie = cookieString.split(';').find(c => c.trim().startsWith(name + '='));
    return cookie ? decodeURI(cookie.split('=')[1]) : null;
}

export async function onRequestGet(context) {
    const { request, env } = context;
    const { DB } = env;

    try {
        // 1. 사용자 인증
        const sessionId = getCookie(request, 'session_id');
        if (!sessionId) {
            return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }

        const session = await DB.prepare('SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime("now")').bind(sessionId).first();
        if (!session) {
            return new Response(JSON.stringify({ error: "Invalid or expired session" }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }

        // 2. 캐릭터 정보 조회 (current_stage 만 필요)
        const user = await DB.prepare('SELECT current_stage FROM users WHERE id = ?').bind(session.user_id).first();
        if (!user) {
            return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        // 3. 몬스터 데이터 생성
        const monsterData = getMonsterForStage(user.current_stage || 1);

        // 4. JSON 응답
        return new Response(JSON.stringify(monsterData), { headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error("Error in /api/monster:", error);
        return new Response(JSON.stringify({ error: "Internal server error", details: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
