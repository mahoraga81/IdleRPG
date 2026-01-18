// --- Constants ---
const DB_NAME = "IdleRPG";
const PLAYERS_COLLECTION = 'players';
const TEST_PLAYER_ID = 'test_player_01';
const DATA_SOURCE = 'Cluster0'; // Default Atlas Data Source name

/**
 * A helper function to interact with the MongoDB Atlas Data API.
 * @param {object} env - The environment object from the Worker.
 * @param {string} action - The Data API action (e.g., 'findOne', 'insertOne', 'updateOne').
 * @param {object} params - The parameters for the action.
 * @returns {Promise<any>} - The result from the Data API.
 */
async function callDataAPI(env, action, params) {
  if (!env.ATLAS_DATA_API_ENDPOINT || !env.ATLAS_API_KEY) {
    throw new Error("MongoDB Atlas Data API environment variables (ATLAS_DATA_API_ENDPOINT, ATLAS_API_KEY) are not configured.");
  }

  const response = await fetch(`${env.ATLAS_DATA_API_ENDPOINT}/action/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': env.ATLAS_API_KEY
    },
    body: JSON.stringify({
      dataSource: DATA_SOURCE,
      database: DB_NAME,
      collection: PLAYERS_COLLECTION,
      ...params
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Data API request failed with status ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// --- API Handlers ---
const api = {
  /**
   * Gets the player data, creating it if it doesn't exist.
   */
  async getPlayer(env) {
    const { document: player } = await callDataAPI(env, 'findOne', { filter: { _id: TEST_PLAYER_ID } });

    if (player) {
      return new Response(JSON.stringify(player), { headers: { 'Content-Type': 'application/json' } });
    }

    const newPlayer = {
      _id: TEST_PLAYER_ID,
      createdAt: new Date().toISOString(),
      stats: { maxHp: 100, attack: 10, defense: 5, critRate: 0.05, attackSpeed: 1.0, evasionRate: 0.05 },
      gold: 1000,
      equipment: { weapon: null, helmet: null, armor: null, ring: null },
      stage: 1,
    };

    await callDataAPI(env, 'insertOne', { document: newPlayer });
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

    const { document: player } = await callDataAPI(env, 'findOne', { filter: { _id: TEST_PLAYER_ID } });

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

    const { modifiedCount } = await callDataAPI(env, 'updateOne', {
      filter: { _id: TEST_PLAYER_ID },
      update: {
        $inc: {
          [`stats.${statName}`]: 1,
          gold: -cost
        }
      }
    });

    if (modifiedCount !== 1) {
      return new Response('Failed to upgrade stat', { status: 500 });
    }
    
    const { document: updatedPlayer } = await callDataAPI(env, 'findOne', { filter: { _id: TEST_PLAYER_ID } });
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

      return env.ASSETS.fetch(request);

    } catch (e) {
      console.error(e);
      return new Response(e.message, { status: 500 });
    }
  }
};
