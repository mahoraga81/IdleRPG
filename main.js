document.addEventListener('DOMContentLoaded', () => {
    const authContainer = document.getElementById('auth-container');
    const gameContainer = document.getElementById('game-container');
    const logoutButton = document.getElementById('logout-button');

    const updatePlayerUI = (playerData) => {
        document.getElementById('player-hp').textContent = playerData.stats_maxHp;
        document.getElementById('player-attack').textContent = playerData.stats_attack;
        document.getElementById('player-defense').textContent = playerData.stats_defense;
        document.getElementById('player-crit-rate').textContent = playerData.stats_critRate;
        document.getElementById('player-crit-damage').textContent = playerData.stats_critDamage;
        document.getElementById('player-attack-speed').textContent = playerData.stats_attackSpeed;
        document.getElementById('player-evasion').textContent = playerData.stats_evasion;
        document.getElementById('player-gold').textContent = playerData.gold;
        document.getElementById('player-stage').textContent = playerData.stage;
    };

    const checkLoginStatus = async () => {
        try {
            const response = await fetch('/api/player');
            if (response.ok) {
                const playerData = await response.json();
                // Logged in
                authContainer.style.display = 'none';
                gameContainer.style.display = 'block';
                updatePlayerUI(playerData);
            } else {
                // Not logged in
                authContainer.style.display = 'block';
                gameContainer.style.display = 'none';
            }
        } catch (error) {
            console.error('Error checking login status:', error);
            authContainer.style.display = 'block';
            gameContainer.style.display = 'none';
        }
    };

    const handleUpgrade = async (stat) => {
        try {
            const response = await fetch('/api/player/upgrade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stat }),
            });
            const result = await response.json();
            if (response.ok) {
                updatePlayerUI(result);
            } else {
                alert(result.message || 'Upgrade failed');
            }
        } catch (error) {
            console.error('Error upgrading stat:', error);
        }
    };

    const handleLogout = async () => {
        try {
            const response = await fetch('/api/auth/logout', { method: 'POST' });
            if(response.ok) {
                window.location.reload();
            } else {
                 alert('Logout failed. Please try again.');
            }
        } catch (error) {
            console.error('Logout Error:', error);
        }
    };

    // Add event listeners to upgrade buttons
    document.querySelectorAll('.upgrade-button').forEach(button => {
        button.addEventListener('click', () => handleUpgrade(button.dataset.stat));
    });
    
    // Add event listener to logout button
    logoutButton.addEventListener('click', handleLogout);

    // Initial check on page load
    checkLoginStatus();
});
