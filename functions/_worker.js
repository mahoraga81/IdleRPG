/**
 * This file is the entrypoint for Cloudflare Functions.
 * It imports the main router from our modular API directory and exports it.
 * This allows Cloudflare to find the expected entrypoint while we keep our code organized.
 */
import router from './api/index.js';

export default router;
