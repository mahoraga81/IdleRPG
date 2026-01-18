import { MongoClient, ServerApiVersion } from 'mongodb';

// --- 상수 정의 ---
const DB_NAME = "IdleRPG";
const PLAYERS_COLLECTION = 'players';
const TEST_PLAYER_ID = 'test_player_01';

// --- API 핸들러 ---
const api = {
  // ... (getPlayer, upgradeStat 함수는 변경 없음)
  async getPlayer(db) {
    const playersCollection = db.collection(PLAYERS_COLLECTION);
    let player = await playersCollection.findOne({ _id: TEST_PLAYER_ID });

    if (!player) {
      const newPlayer = {
        _id: TEST_PLAYER_ID,
        createdAt: new Date(),
        stats: { maxHp: 100, attack: 10, defense: 5, critRate: 0.05, attackSpeed: 1.0, evasionRate: 0.05 },
        gold: 1000, 
        equipment: { weapon: null, helmet: null, armor: null, ring: null },
        stage: 1,
      };
      await playersCollection.insertOne(newPlayer);
      player = newPlayer;
    }
    return new Response(JSON.stringify(player), { headers: { 'Content-Type': 'application/json' } });
  },

  async upgradeStat(db, request) {
    const { stat } = await request.json();
    if (!stat) return new Response('"stat" is required', { status: 400 });

    const player = await db.collection(PLAYERS_COLLECTION).findOne({ _id: TEST_PLAYER_ID });
    if (!player) return new Response('Player not found', { status: 404 });

    const upgradeCost = Math.floor((player.stats[stat] + 1) * 10);
    if (player.gold < upgradeCost) return new Response(JSON.stringify({ message: 'Not enough gold' }), { status: 402 });

    const result = await db.collection(PLAYERS_COLLECTION).updateOne(
      { _id: TEST_PLAYER_ID },
      { 
        $set: { 
          gold: player.gold - upgradeCost, 
          [`stats.${stat}`]: player.stats[stat] + (stat.includes('Rate') ? 0.01 : 1) 
        }
      }
    );

    if (result.modifiedCount === 0) return new Response('Stat upgrade failed', { status: 500 });

    const updatedPlayer = await db.collection(PLAYERS_COLLECTION).findOne({ _id: TEST_PLAYER_ID });
    return new Response(JSON.stringify(updatedPlayer), { headers: { 'Content-Type': 'application/json' } });
  },

  /**
   * POST /api/stage-clear
   * 플레이어의 현재 스테이지를 1 증가시킵니다.
   */
  async clearStage(db) {
    const result = await db.collection(PLAYERS_COLLECTION).findOneAndUpdate(
        { _id: TEST_PLAYER_ID },
        { $inc: { stage: 1 } },
        { returnDocument: 'after' } // 업데이트 이후의 문서를 반환
    );

    if (!result) {
        return new Response('Player not found, could not clear stage', { status: 404 });
    }

    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  }
};

// --- Worker 진입점 ---
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      const client = new MongoClient(env.MONGODB_URI, { serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true } });
      try {
        await client.connect();
        const db = client.db(DB_NAME);

        // --- API 라우터 ---
        if (url.pathname === '/api/player' && request.method === 'GET') {
          return api.getPlayer(db);
        }
        if (url.pathname === '/api/upgrade' && request.method === 'POST') {
          return api.upgradeStat(db, request);
        }
        if (url.pathname === '/api/stage-clear' && request.method === 'POST') {
          return api.clearStage(db);
        }

        return new Response('API endpoint not found', { status: 404 });
      } catch (error) {
        console.error("Database operation failed:", error);
        return new Response('Internal Server Error', { status: 500 });
      } finally {
        await client.close();
      }
    }

    return env.ASSETS.fetch(request);
  },
};