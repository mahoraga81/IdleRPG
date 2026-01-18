document.addEventListener("DOMContentLoaded", () => {
    const authContainer = document.getElementById("auth-container");
    const gameContainer = document.getElementById("game-container");

    const updateStatsUI = (userData) => {
        document.getElementById("player-hp").textContent = userData.stats_maxHp;
        document.getElementById("player-attack").textContent = userData.stats_attack;
        document.getElementById("player-defense
").textContent = userData.stats_defense;
        document.getElementById("player-crit-rate").textContent = (userData.stats_critRate * 100).toFixed(2);
        document.getElementById("player-crit-damage").textContent = (userData.stats_critDamage * 100).toFixed(2);
        document.getElementById("player-attack-speed").textContent = userData.stats_attackSpeed.toFixed(2);
        document.getElementById("player-evasion").textContent = (userData.stats_evasion * 100).toFixed(2);

        document.getElementById("player-gold").textContent = userData.gold;
        document.getElementById("player-stage").textContent = userData.stage;
    };

    const checkLoginStatus = async () => {
        try {
            const response = await fetch("/api/me");

            if (response.ok) {
                const userData = await response.json();
                
                // Logged in: show game, hide auth
                authContainer.style.display = "none";
                gameContainer.style.display = "block";
                
                // Update UI with user data
                const welcomeMessage = document.createElement("h1");
                welcomeMessage.textContent = `Welcome, ${userData.name}!`;
                const playerImage = document.createElement("img");
                playerImage.src = userData.picture;
                playerImage.alt = "Player Avatar";
                playerImage.style.width = "50px";
                playerImage.style.borderRadius = "50%";
                gameContainer.insertBefore(playerImage, gameContainer.firstChild);
                gameContainer.insertBefore(welcomeMessage, gameContainer.firstChild);

                updateStatsUI(userData);

            } else {
                // Not logged in: show auth, hide game
                authContainer.style.display = "block";
                gameContainer.style.display = "none";
            }
        } catch (error) {
            console.error("Error checking login status:", error);
            authContainer.style.display = "block";
            gameContainer.style.display = "none";
        }
    };

    const logoutButton = document.getElementById("logout-button");
    if (logoutButton) {
        logoutButton.addEventListener("click", async () => {
            // We need a logout API endpoint to clear the session cookie
            // For now, just reload the page as a simple logout.
            // A proper logout would involve an API call.
            window.location.reload(); 
        });
    }

    // Initial check when the page loads
    checkLoginStatus();
});
