document.addEventListener("DOMContentLoaded", () => {
    const authContainer = document.getElementById("auth-container");
    const gameContainer = document.getElementById("game-container");
    const logoutButton = document.getElementById("logout-button");

    let userData = {};
    let gameState = {
        currentMonster: {
            hp: 0,
            maxHp: 0,
        },
        monstersSlain: 0,
        monstersPerStage: 10,
    };
    let gameLoopInterval = null;

    // Helper to format large numbers
    const formatNumber = (num) => {
        if (num < 1000) return num.toFixed(0);
        const suffixes = ["", "K", "M", "B", "T"];
        const i = Math.floor(Math.log10(num) / 3);
        return `${(num / Math.pow(1000, i)).toFixed(2)}${suffixes[i]}`;
    };

    // Updates all dynamic UI elements
    const updateUI = () => {
        // Player Stats
        document.getElementById("player-hp").textContent = formatNumber(userData.stats_maxHp);
        document.getElementById("player-attack").textContent = formatNumber(userData.stats_attack);
        document.getElementById("player-defense").textContent = formatNumber(userData.stats_defense);
        document.getElementById("player-crit-rate").textContent = (userData.stats_critRate * 100).toFixed(1);
        document.getElementById("player-crit-damage").textContent = (userData.stats_critDamage * 100).toFixed(1);
        document.getElementById("player-attack-speed").textContent = userData.stats_attackSpeed.toFixed(2);
        document.getElementById("player-evasion").textContent = (userData.stats_evasion * 100).toFixed(1);

        // Game Info
        document.getElementById("player-gold").textContent = formatNumber(userData.gold);
        const dps = userData.stats_attack * userData.stats_attackSpeed * (1 + userData.stats_critRate * userData.stats_critDamage);
        document.getElementById("player-dps").textContent = formatNumber(dps);
        
        // Battle Scene
        document.getElementById("stage-level").textContent = userData.stage;
        document.getElementById("monster-slain-count").textContent = gameState.monstersSlain;
        document.getElementById("monsters-per-stage").textContent = gameState.monstersPerStage;
        document.getElementById("stage-progress").style.width = `${(gameState.monstersSlain / gameState.monstersPerStage) * 100}%`;

        // Monster Info
        document.getElementById("monster-hp-bar").style.width = `${(gameState.currentMonster.hp / gameState.currentMonster.maxHp) * 100}%`;
        document.getElementById("monster-hp-text").textContent = `${formatNumber(gameState.currentMonster.hp)} / ${formatNumber(gameState.currentMonster.maxHp)}`;
    };

    const spawnNewMonster = () => {
        // Monster stats scale with the stage level
        gameState.currentMonster.maxHp = Math.ceil(100 * Math.pow(1.25, userData.stage - 1));
        gameState.currentMonster.hp = gameState.currentMonster.maxHp;
    };

    const gameLoop = () => {
        const dps = userData.stats_attack * userData.stats_attackSpeed * (1 + userData.stats_critRate * userData.stats_critDamage);
        const damagePerTick = dps / 10; // Loop runs 10 times per second

        gameState.currentMonster.hp -= damagePerTick;

        if (gameState.currentMonster.hp <= 0) {
            // Monster is slain
            gameState.monstersSlain++;
            const goldGained = Math.ceil(10 * Math.pow(1.1, userData.stage - 1));
            userData.gold += goldGained;

            if (gameState.monstersSlain >= gameState.monstersPerStage) {
                // Stage cleared
                userData.stage++;
                gameState.monstersSlain = 0;
            }
            spawnNewMonster();
        }

        updateUI();
    };

    const startGame = (initialUserData) => {
        userData = initialUserData;
        spawnNewMonster();
        
        if(gameLoopInterval) clearInterval(gameLoopInterval);
        gameLoopInterval = setInterval(gameLoop, 100); // Run the loop every 100ms
        
        // Initial UI setup
        const welcomeMessage = document.createElement("h1");
        welcomeMessage.textContent = `Welcome, ${userData.name}!`;
        const playerImage = document.createElement("img");
        playerImage.src = userData.picture;
        playerImage.alt = "Player Avatar";
        gameContainer.insertBefore(playerImage, gameContainer.firstChild);
        gameContainer.insertBefore(welcomeMessage, gameContainer.firstChild);

        updateUI();
    };

    const checkLoginStatus = async () => {
        try {
            const response = await fetch("/api/me");
            if (response.ok) {
                const initialUserData = await response.json();
                authContainer.style.display = "none";
                gameContainer.style.display = "block";
                startGame(initialUserData);
            } else {
                authContainer.style.display = "block";
                gameContainer.style.display = "none";
            }
        } catch (error) {
            console.error("Error checking login status:", error);
            authContainer.style.display = "block";
            gameContainer.style.display = "none";
        }
    };

    logoutButton.addEventListener("click", () => {
        // A proper logout will be implemented later. 
        // For now, we just clear the cookie by setting its expiration to the past.
        document.cookie = "session_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
        window.location.reload();
    });

    checkLoginStatus();
});
