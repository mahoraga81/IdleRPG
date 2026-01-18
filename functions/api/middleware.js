import { jsonResponse } from './utils';
import { jwtVerify } from 'jose';

// JWT-related constants
const JWT_COOKIE_NAME = 'jwt-token';

/**
 * Authentication middleware.
 * Verifies the JWT from the cookie and injects user data into the request.
 */
export async function authMiddleware(request, env) {
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader) {
        return jsonResponse({ message: 'Authentication required: No cookie header' }, 401);
    }

    const cookies = Object.fromEntries(cookieHeader.split(';').map(c => c.trim().split('=').map(decodeURIComponent)));
    const token = cookies[JWT_COOKIE_NAME];

    if (!token) {
        return jsonResponse({ message: 'Authentication required: No token found' }, 401);
    }

    try {
        const secret = new TextEncoder().encode(env.JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);

        if (!payload.sub || !payload.jti) {
            return jsonResponse({ message: 'Invalid token payload' }, 401);
        }
        
        // Check against the session ID in the database for multi-device control
        const stmt = env.DB.prepare('SELECT session_token_id FROM players WHERE id = ?');
        const user = await stmt.bind(payload.sub).first();

        if (!user) {
            return jsonResponse({ message: 'User not found' }, 401);
        }

        if (user.session_token_id !== payload.jti) {
             return jsonResponse({ message: 'Session expired. Please log in again.' }, 401);
        }

        // Inject user ID into the request for downstream handlers
        request.userId = payload.sub; // subject -> user ID

    } catch (e) {
        if (e.code === 'ERR_JWT_EXPIRED') {
            return jsonResponse({ message: 'Token has expired' }, 401);
        }
        return jsonResponse({ message: 'Authentication failed: Invalid token', error: e.message }, 401);
    }
}
