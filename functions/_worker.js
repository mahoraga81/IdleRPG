import { MongoClient } from 'mongodb';

const DB_NAME = "IdleRPG";
const PLAYERS_COLLECTION = 'players';
const TEST_PLAYER_ID = 'test_player_01';

let client;

/**
 * Gets the MongoDB database instance, initializing the client if necessary.
 * @param {object} env - The environment object from the Worker.
 * @returns {Promise<Db>} - The MongoDB database object.
 */
async function getDb(env) {
  if (!client) {
    if (!env.MONGODB_URI) {
      throw new Error("MONGODB_URI environment variable is not configured.");
    }
    client = new MongoClient(env.MONGODB_URI);
    await client.connect();
  }
  return client.db(DB_NAME);
}

// --- API Handlers ---
const api = {
  /**
   * Gets the player data, creating it if it doesn't exist.
   */
  async getPlayer(env) {
    const db = await getDb(env);
    const players = db.collection(PLAYERS_COLLECTION);
    let player = await players.findOne({ _id: TEST_PLAYER_ID });

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

    await players.insertOne(newPlayer);
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

    const db = await getDb(env);
    const players = db.collection(PLAYERS_COLLECTION);
    const player = await players.findOne({ _id: TEST_PLAYER_ID });

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

    const result = await players.updateOne(
      { _id: TEST_PLAYER_ID },
      {
        $inc: {
          [`stats.${statName}`]: 1,
          gold: -cost
        }
      }
    );

    if (result.modifiedCount !== 1) {
      return new Response('Failed to upgrade stat', { status: 500 });
    }
    
    const updatedPlayer = await players.findOne({ _id: TEST_PLAYER_ID });
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
