document.addEventListener('DOMContentLoaded', async () => {
    const loginView = document.getElementById('login-view');
    const gameView = document.getElementById('game-view');
    const userInfoDiv = document.getElementById('user-info');
    const characterStatsDiv = document.getElementById('character-stats');
    
    // New UI elements
    const gameMenu = document.getElementById('game-menu');
    const menuButtons = document.querySelectorAll('.menu-button');
    const views = document.querySelectorAll('.view');

    async function checkLoginStatus() {
        try {
            const response = await fetch('/api/me');
            if (response.ok) {
                const userData = await response.json();
                showGameView(userData);
            } else {
                showLoginView();
            }
        } catch (error) {
            console.error('Error checking login status:', error);
            showLoginView();
        }
    }

    function showLoginView() {
        loginView.classList.remove('hidden');
        gameView.classList.add('hidden');
    }

    function showGameView(userData) {
        loginView.classList.add('hidden');
        gameView.classList.remove('hidden');

        const { user, character } = userData;

        // Populate user info (now in the header)
        userInfoDiv.innerHTML = `
            <img src="${user.picture}" alt="${user.name}'s profile picture">
            <div>
                <strong>${user.name}</strong>
                <small>${user.email}</small>
            </div>
        `;

        // Populate character stats in the 'status-view'
        characterStatsDiv.innerHTML = `
            <h3>Character Stats</h3>
            <div class="stats-grid">
                <span><strong>Level:</strong> ${character.level}</span>
                <span><strong>Gold:</strong> ${character.gold}</span>
                <span><strong>HP:</strong> ${character.hp}</span>
                <span><strong>DPS:</strong> ${character.dps.toFixed(2)}</span>
                <span><strong>Attack Power:</strong> ${character.ap}</span>
                <span><strong>Attack Speed:</strong> ${character.attack_speed.toFixed(2)}/s</span>
                <span><strong>Crit Rate:</strong> ${(character.crit_rate * 100).toFixed(1)}%</span>
                <span><strong>Crit Damage:</strong> ${(character.crit_damage * 100).toFixed(0)}%</span>
                <span><strong>Defense:</strong> ${character.def}</span>
                <span><strong>Evasion:</strong> ${(character.evasion_rate * 100).toFixed(1)}%</span>
                <span><strong>STR:</strong> ${character.str}</span>
                <span><strong>DEX:</strong> ${character.dex}</span>
            </div>
        `;
    }

    // --- New Menu Switching Logic ---
    gameMenu.addEventListener('click', (e) => {
        if (!e.target.classList.contains('menu-button')) return;

        const targetViewId = e.target.dataset.view;

        // Update button active state
        menuButtons.forEach(button => {
            button.classList.remove('active');
        });
        e.target.classList.add('active');

        // Switch view
        views.forEach(view => {
            if (view.id === targetViewId) {
                view.classList.add('active');
                view.classList.remove('hidden'); // Ensure it's not hidden by the old class
            } else {
                view.classList.remove('active');
                view.classList.add('hidden'); // Use hidden for consistency if needed, but active class handles display
            }
        });
    });

    // Initial setup
    checkLoginStatus();
});
