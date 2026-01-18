# Blueprint: Cloudflare D1 기반 웹 방치형 RPG

## 1. 개요
Cloudflare D1 데이터베이스와 Cloudflare Pages/Functions를 기반으로 구축된, 현대적이고 확장 가능한 서버리스 웹 방치형 RPG입니다. 이 문서는 게임의 현재 아키텍처, 핵심 기능 및 향후 개발 계획을 정의합니다.

---

## 2. 핵심 아키텍처

- **프론트엔드:** 순수 HTML, CSS, JavaScript로 구성됩니다. 복잡한 프레임워크 없이 웹 표준(Web Components, ES Modules)을 최대한 활용하여 가볍고 빠른 사용자 경험을 제공합니다.

- **백엔드:** Cloudflare Pages Functions를 사용하여 서버리스 API를 구현합니다. 모든 게임 로직과 데이터 처리는 이 Functions 내에서 이루어집니다.

- **데이터베이스:** Cloudflare D1 (SQLite 기반)을 사용하여 모든 게임 데이터를 저장합니다. 백엔드 함수는 Cloudflare 런타임에 내장된 바인딩을 통해 D1과 직접 상호작용하므로, 외부 드라이버나 복잡한 연결 설정이 필요 없습니다.

- **인증:** Google OAuth 2.0과 JWT(JSON Web Tokens)를 결합하여 안전하고 확장 가능한 인증 시스템을 구현합니다.

- **배포:** GitHub 저장소의 `main` 브랜치에 코드를 푸시하면, Cloudflare Pages가 자동으로 빌드 및 배포를 수행하는 CI/CD 파이프라인을 사용합니다.

---

## 3. 현재 구현된 기능

### 3.1. 데이터 관리 (Cloudflare D1)

- **플레이어 테이블 (`players`):**
  - **구조:** `id`, `gold`, `stage` 및 각종 스탯(`stats_maxHp` 등)을 저장하며, Google User ID를 기본 키로 사용합니다.
  - **세션 관리:** `session_token_id` 컬럼을 통해 가장 최근에 발급된 JWT의 고유 ID를 추적하여, 단일 세션(또는 가장 최근 로그인된 기기)만 유효하도록 보장합니다.

### 3.2. 백엔드 API (`functions/_middleware.js`)

- **라우팅:** `itty-router`를 사용하여 `/api/auth`, `/api/player` 등 모듈화된 API 엔드포인트를 관리합니다.

- **인증 API (`/api/auth`):**
  - **동적 리디렉션 URI:** Google 로그인 요청 시, 하드코딩된 주소 대신 요청 `origin`을 동적으로 감지하여 리디렉션 URI(`https://<hostname>/api/auth/google/callback`)를 생성합니다.
  - **OAuth 2.0 콜백:** Google로부터 받은 인증 코드를 사용하여 액세스 토큰을 요청하고, 사용자 프로필 정보를 가져옵니다.
  - **JWT 발급 및 플레이어 관리:** 인증 성공 시, 플레이어 데이터를 생성/업데이트하고 세션 관리를 위한 JWT를 발급합니다.

- **플레이어 데이터 API (`/api/player`):**
  - **인증 미들웨어:** 모든 요청에 대해 JWT 쿠키의 유효성을 검사하여, 인증된 사용자만 API를 호출할 수 있도록 보호합니다.
  - **데이터 조회 및 스탯 업그레이드:** 인증된 플레이어의 게임 데이터를 조회하고 관리합니다.

### 3.3. 프론트엔드 (`index.html`, `main.js`, `style.css`)

- **UI:** JWT 쿠키 유무에 따라 로그인/로그아웃 버튼을 동적으로 표시하고, 인증된 사용자의 게임 데이터를 렌더링합니다.

---

## 4. 진행 중인 작업: Google OAuth 정책 오류 디버깅

- **현재 문제:** Google 로그인 시 "This app doesn't comply with Google's OAuth 2.0 policy" (오류 코드 `400: invalid_request`)가 발생합니다.
- **진단 계획:**
  1.  `functions/_middleware.js`의 인증 로직에 `console.log`를 추가하여, Google에 전송되는 `redirect_uri`의 실제 값을 실시간으로 확인합니다.
  2.  배포 후 Cloudflare 대시보드의 로그를 분석하여, Google이 반환하는 오류의 정확한 원인을 파악하고 수정 조치를 진행합니다.

---

## 5. 향후 계획 및 개선점

- **전투 시스템:** 몬스터와의 전투 로직 및 시각적 연출을 구현합니다.
- **장비 시스템:** 장비 획득, 강화, 장착 기능을 추가합니다.
- **오프라인 보상:** 사용자가 접속하지 않은 시간에 대한 보상 로직을 구현합니다.
- **UI/UX 개선:** Web Components를 도입하여 UI를 컴포넌트화하고, 시각적 효과와 애니메이션을 추가하여 게임 경험을 향상시킵니다.
