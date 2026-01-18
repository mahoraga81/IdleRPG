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
    const monsterHp = document.getElementById('monster-hp');

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
        updateUpgradeButtons(gameState.character);
    }

    function updateCharacterUI(character) {
        if (!characterStatsDiv || !character) return;
        const derivedStatMapping = { hp: '체력', ap: '공격력', dps: 'DPS', crit_rate: '치명타율', evasion_rate: '회피율' };
        const baseStatMapping = { str: '힘', dex: '민첩' };
        const formatPercent = (value) => `${(value * 100).toFixed(2)}%`;

        characterStatsDiv.innerHTML = `
            <h3>캐릭터 상태</h3>
            <div class="stat-item"><span>골드</span><span class="value">${Math.floor(character.gold)} G</span></div>
            <hr>
            <h4>파생 능력치</h4>
            ${Object.keys(derivedStatMapping).map(stat => `
                <div class="stat-item derived-stat">
                    <span>${derivedStatMapping[stat]}</span>
                    <span class="value">${stat.includes('_rate') ? formatPercent(character[stat]) : character[stat].toFixed(2)}</span>
                </div>
            `).join('')}
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
                        <button class="upgrade-button" data-stat="${stat}">+</button>
                    </div>
                </div>
            `).join('')}
        `;
    }

    function updateUpgradeButtons(character) {
        if (!characterStatsDiv || !character) return;
        characterStatsDiv.querySelectorAll('.upgrade-button').forEach(button => {
            const stat = button.dataset.stat;
            const cost = getUpgradeCost(character[stat]);
            button.disabled = character.gold < cost;
        });
    }

    function updateBattleUI(character, monster) {
        if (!character || !monster) return;
        const requiredKills = character.current_stage;
        const currentKills = character.stage_progress || 0;
        if (stageLevel) stageLevel.textContent = `Stage ${character.current_stage} (${currentKills}/${requiredKills})`;
        if (stageProgress) stageProgress.style.width = `${(currentKills / requiredKills) * 100}%`;
        if (monsterName) monsterName.innerHTML = `${monster.name} <small>[${monster.grade}]</small>`;
        if (monsterHp) monsterHp.style.width = `${Math.max(0, (monster.hp / monster.maxHp) * 100)}%`;
    }

    // --- Battle Logic ---
    function startBattleLoop() {
        if (battleInterval) clearInterval(battleInterval);
        battleInterval = setInterval(battleLoop, 100);
    }

    function battleLoop() {
        if (gameState.isBattleLocked || !gameState.monster || !gameState.character) return;
        gameState.monster.hp -= gameState.character.dps / 10;
        if (gameState.monster.hp <= 0) {
            gameState.isBattleLocked = true;
            clearInterval(battleInterval);
            if (monsterHp) monsterHp.style.width = '0%';
            handleVictory();
            return;
        }
        updateBattleUI(gameState.character, gameState.monster);
    }

    async function handleVictory() {
        try {
            const result = await fetcher('/api/battle', { method: 'POST' });
            gameState.character = result.character;
            gameState.monster = result.nextMonster;
            updateAllUI();
        } catch (error) {
            console.error('Victory handling failed:', error);
            showError('전투 승리 처리 중 오류가 발생했습니다.');
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
    if (characterStatsDiv) {
        characterStatsDiv.addEventListener('click', (e) => {
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
