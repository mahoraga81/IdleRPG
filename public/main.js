document.addEventListener('DOMContentLoaded', async () => {
    // --- State Management ---
    let gameState = {
        user: null,
        character: null,
        monster: null,
        isBattleLocked: false,
        monsterAttackProgress: 0,
    };
    let battleInterval = null;

    // --- UI Elements ---
    const loginView = document.getElementById('login-view');
    const gameView = document.getElementById('game-view');
    const userInfoDiv = document.getElementById('user-info');
    const characterPanel = document.getElementById('character-panel');
    const monsterPanel = document.getElementById('monster-panel');
    const upgradeContainer = document.getElementById('upgrade-container');

    // --- Helper & API Functions ---
    function getUpgradeCost(level) {
        return Math.floor(10 * Math.pow(1.15, level - 1));
    }

    async function fetcher(url, options = {}) {
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({ error: 'Request failed with no JSON body' }));
            const errorMessage = `HTTP ${response.status}: ${errorBody.details || errorBody.error || 'Unknown error'}`;
            throw new Error(errorMessage);
        }
        return response.json();
    }

    // --- UI Update Functions ---
    function updateAllUI() {
        if (!gameState.character) return;
        updateCharacterUI(gameState.character);
        updateBattleUI(gameState.character, gameState.monster);
        updateUpgradeUI(gameState.character);
    }

    function updateCharacterUI(character) {
        if (!characterPanel || !character) return;
        characterPanel.innerHTML = `
            <h3>플레이어</h3>
            <div class="hp-bar-container">
                <div id="player-hp-bar" class="hp-bar"></div>
            </div>
            <div class="stat-item"><span>체력</span><span class="value">${Math.ceil(character.currentHp)} / ${character.hp}</span></div>
            <div class="stat-item"><span>공격력</span><span class="value">${character.ap}</span></div>
            <div class="stat-item"><span>초당 공격</span><span class="value">${character.dps.toFixed(2)}</span></div>
        `;
    }

    function updateUpgradeUI(character) {
        if (!upgradeContainer || !character) return;
        const baseStatMapping = { str: '힘', dex: '민첩' };
        upgradeContainer.innerHTML = `
            <h3>캐릭터 상태</h3>
            <div class="stat-item"><span>골드</span><span class="value">${Math.floor(character.gold)} G</span></div>
            <hr>
            <h4>파생 능력치</h4>
            <div class="stat-item derived-stat"><span>치명타율</span><span class="value">${(character.crit_rate * 100).toFixed(2)}%</span></div>
            <div class="stat-item derived-stat"><span>회피율</span><span class="value">${(character.evasion_rate * 100).toFixed(2)}%</span></div>
            <hr>
            <h4>기본 능력치 (강화 가능)</h4>
            ${Object.keys(baseStatMapping).map(stat => `
                <div class="stat-item base-stat">
                    <div class="stat-info">
                        <span>${baseStatMapping[stat]}</span>
                        <span class="stat-level">Lv. ${character[stat]}</span>
                    </div>
                    <div class="upgrade-control">
                        <span class="upgrade-cost">${getUpgradeCost(character[stat])} G</span>
                        <button class="upgrade-button" data-stat="${stat}" ${character.gold < getUpgradeCost(character[stat]) ? 'disabled' : ''}>+</button>
                    </div>
                </div>
            `).join('')}
        `;
    }

    function updateBattleUI(character, monster) {
        if (!character || !monster || !monsterPanel) return;

        const stageText = character.current_stage % 10 === 0 
            ? `Stage ${character.current_stage} (Boss)`
            : `Stage ${character.current_stage} (${character.stage_progress}/10)`;

        monsterPanel.innerHTML = `
            <h3>몬스터</h3>
            <div class="hp-bar-container">
                <div id="monster-hp-bar" class="hp-bar" style="width: ${Math.max(0, (monster.hp / monster.maxHp) * 100)}%;"></div>
            </div>
            <div class="stat-item"><span>${monster.name}</span><small>[${monster.grade}]</small></div>
            <div class="stat-item"><span>레벨</span><span class="value">${character.current_stage}</span></div>
            <div id="stage-info">${stageText}</div>
        `;
        
        const playerHpBar = document.getElementById('player-hp-bar');
        if(playerHpBar) {
            playerHpBar.style.width = `${Math.max(0, (character.currentHp / character.hp) * 100)}%`;
        }
    }

    // --- Battle Logic ---
    function startBattleLoop() {
        if (battleInterval) clearInterval(battleInterval);
        const TICK_RATE = 100; // ms
        battleInterval = setInterval(() => battleLoop(TICK_RATE), TICK_RATE);
    }

    function battleLoop(tick) {
        if (gameState.isBattleLocked || !gameState.monster || !gameState.character) return;
        
        const tickSeconds = tick / 1000;

        // Player attacks monster
        gameState.monster.hp -= gameState.character.dps * tickSeconds;

        // Monster attacks player
        gameState.monsterAttackProgress += gameState.monster.attack_speed * tickSeconds;
        if (gameState.monsterAttackProgress >= 1) {
            gameState.character.currentHp -= gameState.monster.ap;
            gameState.monsterAttackProgress -= 1;
        }

        // Check for battle end
        if (gameState.monster.hp <= 0) {
            gameState.isBattleLocked = true;
            clearInterval(battleInterval);
            handleVictory();
            return;
        }

        if (gameState.character.currentHp <= 0) {
            gameState.isBattleLocked = true;
            clearInterval(battleInterval);
            handleDefeat();
            return;
        }

        updateBattleUI(gameState.character, gameState.monster);
    }

    async function handleVictory() {
        try {
            const result = await fetcher('/api/battle', { method: 'POST' });
            gameState.character = result.character;
            gameState.character.currentHp = result.character.hp; // Restore HP
            gameState.monster = result.nextMonster;
            gameState.monsterAttackProgress = 0;
            updateAllUI();
        } catch (error) {
            console.error('Victory handling failed:', error);
            showError('전투 승리 처리 중 오류가 발생했습니다.');
        } finally {
            gameState.isBattleLocked = false;
            startBattleLoop();
        }
    }

    async function handleDefeat() {
        try {
            showError('캐릭터가 사망했습니다! 잠시 후 부활합니다...', 2000);
            const result = await fetcher('/api/defeat', { method: 'POST' });
            gameState.character = result.character;
            gameState.character.currentHp = result.character.hp; // Restore HP
            gameState.monster = result.nextMonster;
            gameState.monsterAttackProgress = 0;
            updateAllUI();
        } catch (error) {
            console.error('Defeat handling failed:', error);
            showError('사망 처리 중 오류가 발생했습니다.');
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
            // Keep current HP when upgrading
            const oldMaxHp = gameState.character.hp;
            const newMaxHp = result.character.hp;
            gameState.character.currentHp += (newMaxHp - oldMaxHp);

            updateAllUI();
        } catch (error) {
            console.error(`Failed to upgrade ${stat}:`, error);
            showError(`스탯 강화 실패: ${error.message}`);
        }
    }

    // --- Generic Error Display ---
    function showError(message, duration = 3000) {
        const errorPopup = document.getElementById('error-popup');
        const errorMessage = document.getElementById('error-message');
        if (!errorPopup || !errorMessage) {
            alert(message); 
            return;
        }
        errorMessage.textContent = message;
        errorPopup.classList.add('show');
        setTimeout(() => errorPopup.classList.remove('show'), duration);
    }

    // --- View Management ---
    function showLoginView() {
        if (loginView) loginView.classList.remove('hidden');
        if (gameView) gameView.classList.add('hidden');
        if (battleInterval) clearInterval(battleInterval);
    }

    function showGameView() {
        const user = gameState.user;
        if (loginView) loginView.classList.add('hidden');
        if (gameView) gameView.classList.remove('hidden');
        if (userInfoDiv && user) {
            userInfoDiv.innerHTML = `<img src="${user.picture}" alt="${user.name}'s profile picture"><div><strong>${user.name}</strong><small>${user.email}</small></div>`;
        }
    }

    // --- Event Listeners ---
    if (upgradeContainer) {
        upgradeContainer.addEventListener('click', (e) => {
            if (e.target && e.target.classList.contains('upgrade-button')) {
                handleUpgrade(e.target.dataset.stat);
            }
        });
    }

    // --- Initialization ---
    async function initializeGame() {
        try {
            const initialData = await fetcher('/api/me');
            gameState.user = initialData.user;
            gameState.character = initialData.character;
            gameState.character.currentHp = initialData.character.hp; // Set initial current HP
            gameState.monster = initialData.monster;
            showGameView();
            updateAllUI();
            startBattleLoop();
        } catch (error) {
            console.log('Initialization check failed (user likely not logged in):', error.message);
            showLoginView();
        }
    }

    initializeGame();
});
