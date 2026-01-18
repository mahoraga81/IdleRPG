// A simple helper to respond with JSON
const jsonResponse = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });

// A constant for our test player ID
const TEST_PLAYER_ID = 'test_player_01';

/**
 * Initializes the database. Creates the 'players' table if it doesn't exist
 * and inserts the initial player data if it's not already there.
 * This function is designed to be idempotent.
 */
async function initializeDatabase(env) {
  const { DB } = env;

  // Create the table if it doesn't exist.
  // Using a more relational schema instead of JSON objects.
  await DB.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      createdAt TEXT,
      stats_maxHp INTEGER,
      stats_attack INTEGER,
      stats_defense INTEGER,
      stats_critRate REAL,
      stats_attackSpeed REAL,
      stats_evasionRate REAL,
      gold INTEGER,
      stage INTEGER
    );
  `);

  // Check if the player already exists
  const playerExists = await DB.prepare('SELECT id FROM players WHERE id = ?').bind(TEST_PLAYER_ID).first('id');

  // If the player doesn't exist, insert the default data
  if (!playerExists) {
    const stmt = DB.prepare(`
      INSERT INTO players (
        id, createdAt, stats_maxHp, stats_attack, stats_defense,
        stats_critRate, stats_attackSpeed, stats_evasionRate, gold, stage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);
    await stmt.bind(
      TEST_PLAYER_ID,
      new Date().toISOString(),
      100, // maxHp
      10,  // attack
      5,   // defense
      0.05, // critRate
      1.0, // attackSpeed
      0.05, // evasionRate
      1000, // gold
      1   // stage
    ).run();
  }
}

/**
 * Transforms the flat SQL result into the nested JSON structure the frontend expects.
 */
function mapPlayerToObject(player) {
    if (!player) return null;
    return {
        _id: player.id,
        createdAt: player.createdAt,
        stats: {
            maxHp: player.stats_maxHp,
            attack: player.stats_attack,
            defense: player.stats_defense,
            critRate: player.stats_critRate,
            attackSpeed: player.stats_attackSpeed,
            evasionRate: player.stats_evasionRate,
        },
        gold: player.gold,
        stage: player.stage,
        // Equipment is no longer stored, but we can return the old structure
        equipment: { weapon: null, helmet: null, armor: null, ring: null },
    };
}


const api = {
  /**
   * Gets the player data.
   */
  async getPlayer(env) {
    // Ensure DB is initialized
    await initializeDatabase(env);

    // Fetch the player data
    const player = await env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(TEST_PLAYER_ID).first();

    if (!player) {
      return jsonResponse({ message: 'Player not found after initialization, something is wrong.' }, 500);
    }

    return jsonResponse(mapPlayerToObject(player));
  },

  /**
   * Upgrades a player's stat.
   */
  async upgradeStat(env, url) {
    const statName = new URL(url).searchParams.get('stat');
    const validStats = ['maxHp', 'attack', 'defense', 'critRate', 'attackSpeed', 'evasionRate'];

    if (!statName || !validStats.includes(statName)) {
      return jsonResponse({ message: `Invalid or missing stat name. Valid stats are: ${validStats.join(', ')}` }, 400);
    }

    // The column name in the database
    const dbStatName = `stats_${statName}`;

    // Get current player state
    const player = await env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(TEST_PLAYER_ID).first();

    if (!player) {
      return jsonResponse({ message: 'Player not found' }, 404);
    }
    
    const currentStatValue = player[dbStatName];
    // For rates, the cost calculation might need adjustment, but we'll keep it simple.
    // Let's make rate upgrades cost more.
    const isRate = statName.includes('Rate') || statName.includes('Speed');
    const costMultiplier = isRate ? 100 : 10;
    const upgradeCost = Math.floor((currentStatValue || 0) * costMultiplier);

    if (player.gold < upgradeCost) {
      return jsonResponse({ message: 'Not enough gold' }, 400);
    }
    
    // Determine the increment value. For rates, let's do a smaller increment.
    const increment = isRate ? 0.01 : 1;

    // Perform the upgrade
    const newGold = player.gold - upgradeCost;
    const newStatValue = currentStatValue + increment;
    
    await env.DB.prepare(`UPDATE players SET ${dbStatName} = ?, gold = ? WHERE id = ?`)
      .bind(newStatValue, newGold, TEST_PLAYER_ID)
      .run();
      
    // Fetch and return the updated player data
    const updatedPlayer = await env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(TEST_PLAYER_ID).first();

    return jsonResponse(mapPlayerToObject(updatedPlayer));
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
        return jsonResponse({ message: 'Unknown API action' }, 404);
      }

      // For any other request, serve static assets from the Pages build
      return env.ASSETS.fetch(request);

    } catch (e) {
      // If the error is a D1_ERROR, it could be that the DB is not yet configured.
      // Provide a more helpful error message.
      if (e.message.includes('D1_ERROR') || e.message.includes('database')) {
          return jsonResponse({
              error: 'Database not configured.',
              message: 'The backend code is deployed, but it needs to be connected to a D1 database. Please go to your Cloudflare Pages project > Settings > Functions > D1 database bindings and bind the `DB` variable to your D1 database.'
          }, 500);
      }
      console.error(e.stack);
      return jsonResponse({ error: e.message }, 500);
    }
  }
};
