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

        // Apply defeat penalties
        user.current_stage = Math.max(1, user.current_stage - 1); // Decrease stage, minimum 1
        user.stage_progress = 0; // Reset stage progress
        user.gold = Math.floor(user.gold * 0.9); // Lose 10% of gold

        // Update user data in the database
        await DB.prepare('UPDATE users SET current_stage = ?, stage_progress = ?, gold = ? WHERE id = ?')
            .bind(user.current_stage, user.stage_progress, user.gold, user.id).run();

        // Get the new monster for the reset stage
        const nextMonster = getCurrentMonster(user);
        const { google_id, ...characterData } = user;

        return new Response(JSON.stringify({
            message: "You have been defeated!",
            character: characterData,
            nextMonster: nextMonster
        }), { headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error('Defeat API error:', error);
        return new Response(JSON.stringify({ error: "An internal server error occurred.", details: error.message }), { status: 500 });
    }
}
