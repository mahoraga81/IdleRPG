document.addEventListener('DOMContentLoaded', async () => {
    const loginView = document.getElementById('login-view');
    const gameView = document.getElementById('game-view');
    const userInfoDiv = document.getElementById('user-info');
    const characterStatsDiv = document.getElementById('character-stats');

    // 로그인 상태를 확인하고 UI를 업데이트하는 함수
    async function checkLoginStatus() {
        try {
            const response = await fetch('/api/me');
            
            if (response.ok) {
                // 로그인 성공
                const userData = await response.json();
                showGameView(userData);
            } else {
                // 로그인 실패 또는 세션 만료
                showLoginView();
            }
        } catch (error) {
            console.error('Error checking login status:', error);
            showLoginView(); // 에러 발생 시 로그인 화면 표시
        }
    }

    // 로그인 뷰를 표시하는 함수
    function showLoginView() {
        loginView.classList.remove('hidden');
        gameView.classList.add('hidden');
    }

    // 게임 뷰를 표시하고 사용자 데이터를 렌더링하는 함수
    function showGameView(userData) {
        loginView.classList.add('hidden');
        gameView.classList.remove('hidden');

        // 사용자 정보 표시 (프로필 사진, 이름)
        userInfoDiv.innerHTML = `
            <img src="${userData.user.picture}" alt="${userData.user.name}'s profile picture">
            <div>
                <strong>${userData.user.name}</strong>
                <small>${userData.user.email}</small>
            </div>
        `;

        // 캐릭터 스탯 표시 (레벨, 골드 등)
        characterStatsDiv.innerHTML = `
            <p><strong>Level:</strong> ${userData.character.level}</p>
            <p><strong>Gold:</strong> ${userData.character.gold}</p>
            <p><strong>STR:</strong> ${userData.character.str}</p>
            <p><strong>DEX:</strong> ${userData.character.dex}</p>
        `;
    }

    // 페이지 로드 시 로그인 상태 확인 실행
    checkLoginStatus();
});
