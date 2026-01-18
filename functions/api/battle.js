import { getMonsterForStage } from '../game/monsters.js';

function getCookie(request, name) {
    const cookieString = request.headers.get('Cookie') || '';
    const cookie = cookieString.split(';').find(c => c.trim().startsWith(name + '='));
    return cookie ? decodeURI(cookie.split('=')[1]) : null;
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const { DB } = env;

    try {
        // 1. 사용자 인증
        const sessionId = getCookie(request, 'session_id');
        if (!sessionId) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });

        const session = await DB.prepare('SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime("now")').bind(sessionId).first();
        if (!session) return new Response(JSON.stringify({ error: "Invalid or expired session" }), { status: 401 });

        // 2. 현재 사용자 정보 조회 (stage_progress 포함)
        const user = await DB.prepare('SELECT id, current_stage, stage_progress FROM users WHERE id = ?').bind(session.user_id).first();
        if (!user) return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });

        const currentStage = user.current_stage || 1;
        const currentProgress = user.stage_progress || 0;
        const requiredKills = currentStage; // 목표 처치 수 = 현재 스테이지 레벨

        // 3. 보상 계산
        const monster = getMonsterForStage(currentStage);
        const goldReward = monster.gold;

        // 4. 스테이지 진행 로직 분기
        let stageCleared = false;
        let newStage = currentStage;
        let newProgress = currentProgress + 1;

        if (newProgress >= requiredKills) {
            // 스테이지 클리어!
            stageCleared = true;
            newStage = currentStage + 1;
            newProgress = 0;
            await DB.prepare(
                'UPDATE users SET gold = gold + ?, current_stage = ?, stage_progress = ? WHERE id = ?'
            ).bind(goldReward, newStage, newProgress, user.id).run();
        } else {
            // 스테이지 진행 중
            await DB.prepare(
                'UPDATE users SET gold = gold + ?, stage_progress = ? WHERE id = ?'
            ).bind(goldReward, newProgress, user.id).run();
        }

        // 5. 업데이트된 전체 캐릭터 정보 반환
        const updatedCharacterRaw = await DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
        const { google_id, ...characterData } = updatedCharacterRaw;
        characterData.dps = characterData.ap * characterData.attack_speed * (1 + characterData.crit_rate * characterData.crit_damage);

        return new Response(JSON.stringify({
            message: stageCleared ? `Stage ${currentStage} cleared!` : `Monster defeated.`,
            gold_reward: goldReward,
            stage_cleared: stageCleared,
            character: characterData
        }), { headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error("Error in /api/battle:", error);
        return new Response(JSON.stringify({ error: "Internal server error", details: error.message }), { status: 500 });
    }
}
