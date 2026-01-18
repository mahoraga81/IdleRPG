import { Router } from 'itty-router';
import { authRouter } from './auth';
import { playerRouter } from './player';
import { jsonResponse } from './utils';

// Create a new router
const router = Router();

// Integrate the auth and player routers
router.all('/api/auth/*', authRouter.handle);
router.all('/api/player/*', playerRouter.handle);

// Catch-all for any other requests
router.all('*', (request, env) => {
  // For non-api requests, pass them to the static asset handler
  if (!request.url.includes('/api/')) {
    return env.ASSETS.fetch(request);
  }
  return jsonResponse({ message: 'Not Found' }, 404);
});

export default {
  async fetch(request, env, ctx) {
    try {
      return await router.handle(request, env, ctx);
    } catch (e) {
      console.error('Unhandled error:', e.stack);
      // Provide a generic error response
      return jsonResponse({ error: 'Internal Server Error', message: e.message }, 500);
    }
  },
};
