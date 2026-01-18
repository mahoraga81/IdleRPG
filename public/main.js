document.addEventListener('DOMContentLoaded', async () => {
    // --- State Management ---
    let gameState = {
        user: null,
        character: null,
        monster: null,
        isBattleLocked: false,
    };
    let battleInterval = null;

    // --- UI Components ---
    const loginView = document.getElementById('login-view');
    const gameView = document.getElementById('game-view');
    const userInfoDiv = document.getElementById('user-info');
    const characterStatsDiv = document.getElementById('character-stats');
    const stageLevel = document.getElementById('stage-level');
    const stageProgress = document.getElementById('stage-progress');
    const monsterName = document.getElementById('monster-name');
    const monsterHpBar = document.getElementById('monster-hp');
    const gameMenu = document.getElementById('game-menu');
    const menuButtons = document.querySelectorAll('.menu-button');
    const views = document.querySelectorAll('.view');

    // --- Helper & API Functions ---
    function getUpgradeCost(level) {
        return Math.floor(10 * Math.pow(1.15, level - 1));
    }

    async function fetcher(url, options = {}) {
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(`HTTP error ${response.status}: ${errorBody.details || errorBody.error}`);
        }
        return response.json();
    }

    // --- UI Update Functions ---
    function updateAllUI() {
        if (!gameState.character) return;
        updateCharacterUI(gameState.character);
        updateBattleUI(gameState.character, gameState.monster);
        updateUpgradeButtons(gameState.character);
    }
    
    function updateCharacterUI(character) {
        const statMapping = { str: '힘', dex: '민첩' };
        characterStatsDiv.innerHTML = `
            <h3>Character Stats</h3>
            <div class="stat-item"><span>골드</span><span class="upgrade-cost">${Math.floor(character.gold)} G</span></div>
            <div class="stat-item"><span>DPS</span><span class="upgrade-cost">${character.dps.toFixed(2)}</span></div>
            <hr>
            ${Object.keys(statMapping).map(stat => `
                <div class="stat-item">
                    <div class="stat-info"><span>${statMapping[stat]}</span><span class="stat-level">Lv. ${character[stat]}</span></div>
                    <span class="upgrade-cost">${getUpgradeCost(character[stat])} G</span>
                    <button class="upgrade-button" data-stat="${stat}">+</button>
                </div>
            `).join('')}
        `;
    }

    function updateUpgradeButtons(character) {
        const upgradeButtons = document.querySelectorAll('.upgrade-button');
        upgradeButtons.forEach(button => {
            const stat = button.dataset.stat;
            const cost = getUpgradeCost(character[stat]);
            button.disabled = character.gold < cost;
        });
    }

    function updateBattleUI(character, monster) {
        if (!character || !monster) return;
        const requiredKills = character.current_stage;
        const currentKills = character.stage_progress || 0;
        stageLevel.textContent = `Stage ${character.current_stage} (${currentKills}/${requiredKills})`;
        stageProgress.style.width = `${(currentKills / requiredKills) * 100}%`;
        monsterName.innerHTML = `${monster.name} <small style="color: ${monster.grade === 'Boss' ? '#e91e63' : '#ccc'}">[${monster.grade}]</small>`;
        monsterHpBar.style.width = `${Math.max(0, (monster.hp / monster.maxHp) * 100)}%`;
    }

    // --- Battle Logic ---
    function startBattleLoop() {
        if (battleInterval) clearInterval(battleInterval);
        battleInterval = setInterval(battleLoop, 100);
    }

    function battleLoop() {
        if (gameState.isBattleLocked || !gameState.monster) return;
        gameState.monster.hp -= gameState.character.dps / 10;
        if (gameState.monster.hp <= 0) {
            gameState.isBattleLocked = true;
            clearInterval(battleInterval);
            monsterHpBar.style.width = '0%';
            handleVictory();
            return;
        }
        updateBattleUI(gameState.character, gameState.monster);
    }

    async function handleVictory() {
        try {
            const result = await fetcher('/api/battle', { method: 'POST' });
            gameState.character = result.character;
            gameState.monster = result.nextMonster; // Always use the monster from the server
            updateAllUI();
        } catch (error) {
            console.error('Victory handling failed:', error);
        } finally {
            gameState.isBattleLocked = false;
            startBattleLoop();
        }
    }

    // --- Stat Upgrade Logic ---
    async function handleUpgrade(stat) {
        try {
            const result = await fetcher('/api/upgrade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stat }),
            });
            gameState.character = result.character;
            updateAllUI();
        } catch (error) {
            console.error(`Failed to upgrade ${stat}:`, error);
        }
    }

    // --- Initialization ---
    async function initializeGame() {
        try {
            const initialData = await fetcher('/api/me');
            gameState.user = initialData.user;
            gameState.character = initialData.character;
            gameState.monster = initialData.monster;
            showGameView();
            updateAllUI();
            startBattleLoop();
        } catch (error) {
            console.error('Initialization failed:', error);
            showLoginView();
        }
    }

    function showLoginView() {
        loginView.classList.remove('hidden');
        gameView.classList.add('hidden');
        if (battleInterval) clearInterval(battleInterval);
    }

    function showGameView() {
        const user = gameState.user;
        loginView.classList.add('hidden');
        gameView.classList.remove('hidden');
        userInfoDiv.innerHTML = `<img src="${user.picture}" alt="${user.name}'s profile picture"><div><strong>${user.name}</strong><small>${user.email}</small></div>`;
    }

    // --- Event Listeners ---
    gameMenu.addEventListener('click', (e) => {
        if (!e.target.classList.contains('menu-button')) return;
        const targetViewId = e.target.dataset.view;
        menuButtons.forEach(button => button.classList.remove('active'));
        e.target.classList.add('active');
        views.forEach(view => view.classList.toggle('active', view.id === targetViewId));
    });

    characterStatsDiv.addEventListener('click', (e) => {
        if (e.target.classList.contains('upgrade-button')) {
            handleUpgrade(e.target.dataset.stat);
        }
    });

    initializeGame();
});
