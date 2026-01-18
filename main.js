let player = null;
let monster = null;
let currentPlayerHp = 0;
let gameInterval = null;
let monstersKilledInStage = 0;
const MONSTERS_PER_STAGE = 10;

window.addEventListener('load', () => fetchPlayerData());

async function fetchPlayerData() {
    const statsContainer = document.getElementById('player-stats');
    statsContainer.innerHTML = '<p>Loading stats...</p>';
    try {
        const response = await fetch('/api/player');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        player = await response.json();
        currentPlayerHp = player.stats.maxHp;
        renderPlayerStats();
        renderPlayerVitals();
        startGameLoop();
    } catch (error) {
        console.error("Failed to fetch player data:", error);
        statsContainer.innerHTML = '<p>Error loading player data.</p>';
    }
}

async function upgradeStat(stat) {
    try {
        const response = await fetch('/api/upgrade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stat: stat }),
        });
        if (response.status === 402) {
            addLog('Not enough gold!', 'error');
            return;
        }
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const previousMaxHp = player.stats.maxHp;
        player = await response.json();
        // HP가 올랐으면 현재 HP도 같이 올려준다
        if (stat === 'maxHp') {
            currentPlayerHp += player.stats.maxHp - previousMaxHp;
        }
        renderPlayerStats();
        renderPlayerVitals();
        addLog(`Successfully upgraded ${stat}!`, 'success');
    } catch (error) {
        addLog(`Error upgrading ${stat}.`, 'error');
    }
}

async function clearStage() {
    clearInterval(gameInterval);
    addLog(`🎉 STAGE ${player.stage} CLEARED! 🎉`, 'success');
    try {
        const response = await fetch('/api/stage-clear', { method: 'POST' });
        if (!response.ok) throw new Error(`HTTP error!`);
        player = await response.json();
        monstersKilledInStage = 0;
        currentPlayerHp = player.stats.maxHp; // 새 스테이지 시작 시 HP 회복
        renderPlayerStats();
        renderPlayerVitals();
        startGameLoop();
    } catch (error) {
        addLog('Error advancing to next stage. Retrying...', 'error');
        setTimeout(clearStage, 3000);
    }
}

function renderPlayerStats() {
    const statsContainer = document.getElementById('player-stats');
    const { stats, gold, stage } = player;
    document.getElementById('stage-level').textContent = stage;
    const statMapping = { attack: '⚔️', maxHp: '❤️', defense: '🛡️', critRate: '💥', attackSpeed: '⚡', evasionRate: '💨' };
    let statsHtml = '<ul>';
    for (const [key, icon] of Object.entries(statMapping)) {
        const cost = Math.floor((stats[key] + 1) * 10);
        statsHtml += `<li><span>${icon} ${formatStat(key, stats[key])}</span> <button class="upgrade-btn" data-stat="${key}">Up (${formatNumber(cost)}G)</button></li>`;
    }
    statsHtml += '</ul>';
    statsContainer.innerHTML = `<h3>Character Stats</h3><h4>💰 Gold: ${formatNumber(gold)}</h4>${statsHtml}`;
    document.querySelectorAll('.upgrade-btn').forEach(b => b.addEventListener('click', (e) => upgradeStat(e.target.dataset.stat)));
}

function renderPlayerVitals() {
    document.getElementById('player-hp').textContent = Math.ceil(currentPlayerHp);
    document.getElementById('player-max-hp').textContent = player.stats.maxHp;
    document.getElementById('player-hp-bar').style.width = `${(currentPlayerHp / player.stats.maxHp) * 100}%`;
}

function renderMonster() {
    document.getElementById('monster-name').textContent = `${monster.name} (${monstersKilledInStage + 1}/${MONSTERS_PER_STAGE})`;
    document.getElementById('monster-hp').textContent = monster.hp;
    document.getElementById('monster-max-hp').textContent = monster.maxHp;
    document.getElementById('monster-hp-bar').style.width = `${(monster.hp / monster.maxHp) * 100}%`;
}

function startGameLoop() {
    if (gameInterval) clearInterval(gameInterval);
    createMonster(player.stage);
    gameInterval = setInterval(gameTick, 1000);
}

function gameTick() {
    if (!player || !monster || currentPlayerHp <= 0) return;

    // 1. 플레이어 턴
    const playerDamage = Math.max(1, Math.floor(player.stats.attack * (1 / player.stats.attackSpeed)) - (monster.defense || 0));
    monster.hp = Math.max(0, monster.hp - playerDamage);
    addLog(`Player dealt ${playerDamage} damage.`);
    renderMonster();

    if (monster.hp === 0) {
        killMonster();
        return;
    }

    // 2. 몬스터 턴
    const monsterDamage = Math.max(1, monster.attack - player.stats.defense);
    currentPlayerHp = Math.max(0, currentPlayerHp - monsterDamage);
    addLog(`${monster.name} dealt ${monsterDamage} damage.`, 'damage');
    renderPlayerVitals();
    
    if (currentPlayerHp === 0) {
        handlePlayerDeath();
    }
}

function createMonster(stage) {
    const hp = Math.floor(10 * Math.pow(1.3, stage - 1));
    const attack = Math.floor(2 * Math.pow(1.2, stage - 1));
    monster = { name: `Orc Lv.${stage}`, hp, maxHp: hp, attack, gold: Math.ceil(hp / 4) };
    addLog(`${monster.name} appeared!`, 'system');
    renderMonster();
}

function killMonster() {
    addLog(`You defeated ${monster.name}!`, 'success');
    player.gold += monster.gold;
    addLog(`You gained ${monster.gold} gold.`, 'system');
    monstersKilledInStage++;
    if (monstersKilledInStage >= MONSTERS_PER_STAGE) {
        clearStage();
    } else {
        createMonster(player.stage);
    }
    renderPlayerStats();
}

function handlePlayerDeath() {
    addLog('You have been defeated!', 'error');
    clearInterval(gameInterval);
    monstersKilledInStage = 0; // 스테이지 진행도 초기화
    addLog('You will resurrect in 3 seconds...', 'system');
    setTimeout(() => {
        currentPlayerHp = player.stats.maxHp; // HP 전체 회복
        addLog('You have resurrected!', 'success');
        renderPlayerVitals();
        startGameLoop();
    }, 3000);
}

function addLog(message, type = 'normal') {
    const log = document.getElementById('game-log');
    const p = document.createElement('p');
    p.textContent = message;
    if(type === 'error') p.style.color = 'red';
    if(type === 'success') p.style.color = 'green';
    if(type === 'system') p.style.color = 'blue';
    if(type === 'damage') p.style.color = 'orange';
    log.prepend(p);
    if (log.children.length > 50) log.lastChild.remove();
}

function formatNumber(num) {
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    return Math.floor(num);
}

function formatStat(key, val) {
    if (key.includes('Rate')) return `${(val * 100).toFixed(1)}%`;
    if (key.includes('Speed')) return `${val.toFixed(2)}/s`;
    return formatNumber(val);
}
