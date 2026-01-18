import { getCurrentMonster } from '../game/monsters.js';

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

        let user = await DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first();
        if (!user) return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });

        const currentMonster = getCurrentMonster(user);
        const goldEarned = currentMonster.gold;

        let stageCleared = false;
        user.gold += goldEarned;
        
        if (currentMonster.grade === 'Boss') {
            user.current_stage += 1;
            user.stage_progress = 0; // Reset progress for the new stage
            stageCleared = true;
        } else {
            user.stage_progress += 1;
        }

        await DB.prepare('UPDATE users SET gold = ?, current_stage = ?, stage_progress = ? WHERE id = ?')
            .bind(user.gold, user.current_stage, user.stage_progress, user.id).run();
        
        // Fetch the updated user data to pass to getCurrentMonster
        const updatedUser = await DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
        const nextMonster = getCurrentMonster(updatedUser);

        const { google_id, ...characterData } = updatedUser;

        return new Response(JSON.stringify({ 
            message: "Victory!", 
            gold_earned: goldEarned,
            stage_cleared: stageCleared,
            character: characterData,
            nextMonster: nextMonster
        }), { headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error('Battle API error:', error);
        return new Response(JSON.stringify({ error: "An internal server error occurred.", details: error.message }), { status: 500 });
    }
}
