import { Router } from 'itty-router';
import { jsonResponse } from './utils';
import { authMiddleware } from './middleware';

const playerRouter = Router({ base: '/api/player' });

// Apply the authentication middleware to all player routes
playerRouter.all('*', authMiddleware);

// Get player data
playerRouter.get('/', async (request, env) => {
  const { userId } = request; // Injected by authMiddleware

  const stmt = env.DB.prepare('SELECT * FROM players WHERE id = ?');
  const player = await stmt.bind(userId).first();

  if (!player) {
    return jsonResponse({ message: 'Player not found. Should be created on login.' }, 404);
  }

  return jsonResponse(player);
});

// Upgrade a stat
playerRouter.post('/upgrade', async (request, env) => {
  const { userId } = request; // Injected by authMiddleware
  const { stat } = await request.json(); // e.g., { stat: 'stats_attack' }

  if (!stat || !stat.startsWith('stats_')) {
    return jsonResponse({ message: 'Invalid stat provided.' }, 400);
  }

  // Using a transaction to ensure data integrity
  const { results } = await env.DB.batch([
    env.DB.prepare('SELECT gold, ?? as statLevel FROM players WHERE id = ?').bind(stat, userId),
  ]);

  const player = results[0].results[0];

  if (!player) {
    return jsonResponse({ message: 'Player not found' }, 404);
  }

  const currentLevel = player.statLevel;
  const cost = 10 * Math.pow(1.1, currentLevel);

  if (player.gold < cost) {
    return jsonResponse({ message: 'Not enough gold' }, 400);
  }

  const newGold = player.gold - cost;
  const newLevel = currentLevel + 1;

  await env.DB.prepare(
    `UPDATE players SET gold = ?, ?? = ? WHERE id = ?`
  ).bind(newGold, stat, newLevel, userId).run();

  // Fetch the updated player data to return
  const updatedPlayer = await env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(userId).first();

  return jsonResponse(updatedPlayer);
});

export { playerRouter };
