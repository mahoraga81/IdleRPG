
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
        const result = await stmt.all();
        return { success: true, data: result };
    } catch (e) {
        console.error("Database Error:", e);
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

    // Find the session in the database
    const sessionResult = await safeQuery(DB, "SELECT * FROM sessions WHERE id = ?", [sessionId]);

    if (!sessionResult.success || sessionResult.data.length === 0) {
        // Session not found, could be invalid
        return new Response(JSON.stringify({ error: "Invalid session" }), { 
            status: 401, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }

    const session = sessionResult.data[0];

    // Check if the session has expired
    if (new Date(session.expires_at) < new Date()) {
        // Clean up expired session from DB
        await safeQuery(DB, "DELETE FROM sessions WHERE id = ?", [sessionId]);
        return new Response(JSON.stringify({ error: "Session expired" }), { 
            status: 401, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }

    // Session is valid, fetch the user data
    const userResult = await safeQuery(DB, "SELECT * FROM users WHERE id = ?", [session.user_id]);

    if (!userResult.success || userResult.data.length === 0) {
        return new Response(JSON.stringify({ error: "User not found" }), { 
            status: 404, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }

    const user = userResult.data[0];
    
    // Return all user data (including stats)
    return new Response(JSON.stringify(user), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}
