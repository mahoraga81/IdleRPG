document.addEventListener('DOMContentLoaded', async () => {
    // --- State Management ---
    let gameState = {
        character: null,
        monster: null,
        isBattleLocked: false,
    };
    let battleInterval = null;

    // --- UI Components ---
    const loginView = document.getElementById('login-view');
    const gameView = document.getElementById('game-view');
    const battleScreen = document.getElementById('battle-screen');
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
            throw new Error(`HTTP error ${response.status}: ${errorBody.error}`);
        }
        return response.json();
    }

    // --- UI Update Functions ---
    function updateAllUI() {
        updateCharacterUI(gameState.character);
        updateBattleUI(gameState.character, gameState.monster);
    }

    function updateCharacterUI(character) {
        if (!character) return;
        
        const statMapping = {
            str: '힘',
            dex: '민첩',
            // 다른 스탯도 여기에 추가 가능
        };

        characterStatsDiv.innerHTML = `
            <h3>Character Stats</h3>
            <div class="stat-item">
                 <div class="stat-info"><span>골드</span></div>
                 <span class="upgrade-cost">${Math.floor(character.gold)} G</span>
            </div>
             <div class="stat-item">
                 <div class="stat-info"><span>DPS</span></div>
                 <span class="upgrade-cost">${character.dps.toFixed(2)}</span>
            </div>
            <hr>
            ${Object.keys(statMapping).map(stat => {
                const level = character[stat];
                const cost = getUpgradeCost(level);
                const canAfford = character.gold >= cost;
                return `
                    <div class="stat-item">
                        <div class="stat-info">
                            <span>${statMapping[stat]}</span>
                            <span class="stat-level">Lv. ${level}</span>
                        </div>
                        <span class="upgrade-cost">${cost} G</span>
                        <button class="upgrade-button" data-stat="${stat}" ${!canAfford ? 'disabled' : ''}>+</button>
                    </div>
                `;
            }).join('')}
        `;
    }

    function updateBattleUI(character, monster) {
        if (!character || !monster) return;
        const requiredKills = character.current_stage;
        const currentKills = character.stage_progress || 0;
        stageLevel.textContent = `Stage ${character.current_stage} (${currentKills}/${requiredKills})`;
        const stageProgressPercent = (currentKills / requiredKills) * 100;
        stageProgress.style.width = `${stageProgressPercent}%`;
        monsterName.innerHTML = `${monster.name} <small style="color: ${monster.grade === 'Boss' ? '#e91e63' : '#ccc'}">[${monster.grade}]</small>`;
        const hpPercent = Math.max(0, (monster.hp / monster.maxHp) * 100);
        monsterHpBar.style.width = `${hpPercent}%`;
    }

    // --- Battle Logic ---
    function startBattleLoop() {
        if (battleInterval) clearInterval(battleInterval);
        battleInterval = setInterval(battleLoop, 100);
    }

    function battleLoop() {
        if (!gameState.character || !gameState.monster || gameState.isBattleLocked) return;
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
            if (result.stage_cleared) {
                const nextMonster = await fetcher('/api/monster');
                gameState.monster = nextMonster;
            } else {
                gameState.monster.hp = gameState.monster.maxHp;
            }
            updateAllUI();
            gameState.isBattleLocked = false;
            startBattleLoop();
        } catch (error) {
            console.error('Victory handling failed:', error);
            setTimeout(handleVictory, 3000);
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
            gameState.character = result.character; // Update character with new stats
            updateAllUI(); // Refresh UI
        } catch (error) {
            console.error(`Failed to upgrade ${stat}:`, error);
            // Optionally: show a toast message to the user
        }
    }

    // --- Initialization ---
    async function initializeGame() {
        try {
            const userData = await fetcher('/api/me');
            gameState.character = userData.character;
            const monsterData = await fetcher('/api/monster');
            gameState.monster = monsterData;
            showGameView(userData.user);
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

    function showGameView(user) {
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
            const stat = e.target.dataset.stat;
            handleUpgrade(stat);
        }
    });

    initializeGame();
});
