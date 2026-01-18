
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

async function safeQuery(db, query, params = []) {
    try {
        const stmt = db.prepare(query).bind(...params);
        // D1 now returns results in a `results` property
        const { results } = await stmt.all();
        return { success: true, data: results };
    } catch (e) {
        console.error("Database Error:", e, e.cause);
        return { success: false, error: e.message };
    }
}

export async function onRequestGet(context) {
    const { request, env } = context;
    const { DB } = env;

    const sessionId = getCookie(request, 'session_id');

    if (!sessionId) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), { 
            status: 401, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }

    const sessionResult = await safeQuery(DB, "SELECT user_id, expires_at FROM sessions WHERE id = ?", [sessionId]);

    if (!sessionResult.success || sessionResult.data.length === 0) {
        return new Response(JSON.stringify({ error: "Invalid session" }), { 
            status: 401, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }

    const session = sessionResult.data[0];

    if (new Date(session.expires_at) < new Date()) {
        await safeQuery(DB, "DELETE FROM sessions WHERE id = ?", [sessionId]);
        return new Response(JSON.stringify({ error: "Session expired" }), { 
            status: 401, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }

    const userResult = await safeQuery(DB, "SELECT * FROM users WHERE id = ?", [session.user_id]);

    if (!userResult.success || userResult.data.length === 0) {
        return new Response(JSON.stringify({ error: "User not found" }), { 
            status: 404, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }

    const dbUser = userResult.data[0];

    // **FIX:** Structure the data as the frontend expects it.
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
            dex: dbUser.dex
            // Add any other character-specific fields here in the future
        }
    };
    
    return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}
