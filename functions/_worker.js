
// --- Constants ---
const DB_NAME = "IdleRPG";
const PLAYERS_COLLECTION = 'players';
const TEST_PLAYER_ID = 'test_player_01';

/**
 * A helper function to make requests to the MongoDB Atlas Data API.
 * @param {object} env - The environment object from the Worker.
 * @param {string} action - The Data API action to perform (e.g., 'findOne', 'insertOne').
 * @param {object} payload - The payload for the Data API action.
 * @returns {Promise<object>} - The JSON response from the Data API.
 */
async function dataAPIRequest(env, action, payload) {
  // Check for required environment variables
  if (!env.DATA_API_URL || !env.DATA_API_KEY) {
    throw new Error("DATA_API_URL and DATA_API_KEY environment variables are not configured.");
  }

  const response = await fetch(`${env.DATA_API_URL}/action/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': env.DATA_API_KEY,
    },
    body: JSON.stringify({
      dataSource: 'Cluster0', // Typically 'Cluster0', check your Atlas settings
      database: DB_NAME,
      collection: PLAYERS_COLLECTION,
      ...payload,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Data API request failed: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  return response.json();
}

// --- API Handlers ---
const api = {
  /**
   * Gets the player data, creating it if it doesn't exist.
   */
  async getPlayer(env) {
    let { document: player } = await dataAPIRequest(env, 'findOne', {
      filter: { _id: TEST_PLAYER_ID },
    });

    if (player) {
      return new Response(JSON.stringify(player), { headers: { 'Content-Type': 'application/json' } });
    }

    // Player doesn't exist, create a new one
    const newPlayer = {
      _id: TEST_PLAYER_ID,
      createdAt: new Date().toISOString(),
      stats: { maxHp: 100, attack: 10, defense: 5, critRate: 0.05, attackSpeed: 1.0, evasionRate: 0.05 },
      gold: 1000,
      equipment: { weapon: null, helmet: null, armor: null, ring: null },
      stage: 1,
    };

    await dataAPIRequest(env, 'insertOne', {
      document: newPlayer,
    });

    return new Response(JSON.stringify(newPlayer), { headers: { 'Content-Type': 'application/json' } });
  },

  /**
   * Upgrades a player's stat.
   */
  async upgradeStat(env, url) {
    const statName = new URL(url).searchParams.get('stat');
    if (!statName) {
      return new Response('Stat name is required', { status: 400 });
    }

    const { document: player } = await dataAPIRequest(env, 'findOne', {
      filter: { _id: TEST_PLAYER_ID },
    });

    if (!player) {
      return new Response('Player not found', { status: 404 });
    }
    
    if (!(statName in player.stats)) {
      return new Response(`Invalid stat name: ${statName}`, { status: 400 });
    }

    const cost = (player.stats[statName] || 0) * 10;
    if (player.gold < cost) {
      return new Response(JSON.stringify({ message: 'Not enough gold' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Perform the upgrade
    await dataAPIRequest(env, 'updateOne', {
      filter: { _id: TEST_PLAYER_ID },
      update: {
        $inc: {
          [`stats.${statName}`]: 1,
          gold: -cost,
        },
      },
    });
    
    // Fetch the updated player to return the new state
    const { document: updatedPlayer } = await dataAPIRequest(env, 'findOne', {
        filter: { _id: TEST_PLAYER_ID }
    });

    return new Response(JSON.stringify(updatedPlayer), { headers: { 'Content-Type': 'application/json' } });
  }
};

// --- Cloudflare Worker Entrypoint ---
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (path.startsWith('/api/')) {
        const action = path.substring(5);
        if (api[action]) {
          return await api[action](env, request.url);
        }
        return new Response('Unknown API action', { status: 404 });
      }

      // For any other request, serve static assets
      return env.ASSETS.fetch(request);

    } catch (e) {
      console.error(e);
      // Ensure a proper Response object is returned on error
      return new Response(e.message, { status: 500 });
    }
  }
};
