# Blueprint: Cloudflare D1 기반 웹 방치형 RPG

## 1. 개요

- **프로젝트 주소:** [https://idlerpg.mahoraga81.workers.dev/](https://idlerpg.mahoraga81.workers.dev/)

Cloudflare D1 데이터베이스와 Cloudflare Workers/Functions를 기반으로 구축된, 현대적이고 확장 가능한 서버리스 웹 방치형 RPG입니다. 이 문서는 게임의 현재 아키텍처, 핵심 기능 및 향후 개발 계획을 정의합니다.

---

## 2. 핵심 아키텍처

- **프론트엔드:** 순수 HTML, CSS, JavaScript로 구성됩니다. 복잡한 프레임워크 없이 웹 표준을 활용하여 가볍고 빠른 사용자 경험을 제공합니다.

- **백엔드:** Cloudflare Pages Functions (Cloudflare Workers 위에서 실행)를 사용하여 서버리스 API를 구현합니다.

- **데이터베이스:** Cloudflare D1 (SQLite 기반)을 사용하여 모든 게임 데이터를 저장합니다.

- **인증:** Google OAuth 2.0과 JWT(JSON Web Tokens)를 결합하여 안전하고 확장 가능한 인증 시스템을 구현합니다.

- **배포:** GitHub 저장소의 `main` 브랜치에 코드를 푸시하면, Cloudflare가 자동으로 빌드 및 배포를 수행하는 CI/CD 파이프라인을 사용합니다.

---

## 3. 핵심 기능 상세

### 3.1. 데이터 관리 (Cloudflare D1)
- **플레이어 테이블 (`players`):** Google User ID를 기본 키로 사용하여 `id`, `gold`, `stage` 및 각종 스탯을 저장합니다.
- **세션 관리:** `session_token_id` 컬럼으로 가장 최근 JWT의 고유 ID를 추적하여, 단일 세션을 보장합니다.

### 3.2. 백엔드 API (`functions/_middleware.js`)
- **라우팅:** `itty-router`를 사용하여 `/api/auth`, `/api/player` 등 모듈화된 API 엔드포인트를 관리합니다.
- **인증 API (`/api/auth`):
  - **동적 리디렉션 URI:** Google 로그인 요청 시, 요청 `origin`을 동적으로 감지하여 리디렉션 URI (`https://<hostname>/api/auth/google/callback`)를 생성합니다.
  - **OAuth 2.0 및 JWT:** Google 인증 후, 플레이어 데이터를 생성/업데이트하고 세션 관리를 위한 JWT를 발급합니다.

### 3.3. 프론트엔드 (`index.html`, `main.js`)
- **UI:** JWT 쿠키 유무에 따라 로그인/로그아웃 버튼을 동적으로 표시하고, 인증된 사용자의 게임 데이터를 렌더링합니다.

---

## 4. 문제 해결 기록: Google OAuth `400: invalid_request`

- **문제 발생:** Google 로그인 시 "This app doesn't comply with Google's OAuth 2.0 policy" 오류 발생.
- **根本原因:** Google Cloud Console에 등록된 **승인된 리디렉션 URI**가 실제 애플리케이션 주소와 일치하지 않았습니다.
  - **잘못된 URI:** `https://idlerpg.pages.dev/...`
  - **올바른 URI:** `https://idlerpg.mahoraga81.workers.dev/...`
- **해결 조치:** Google Cloud Console의 OAuth 클라이언트 ID 설정에서, 승인된 리디렉션 URI를 `https://idlerpg.mahoraga81.workers.dev/api/auth/google/callback` 으로 수정하여 문제를 해결했습니다.
- **디버깅:** 원인 파악을 위해 `functions/_middleware.js`에 `console.log`를 추가하여 배포하였으며, 이를 통해 요청/콜백 시 사용되는 `redirect_uri` 값을 실시간으로 확인했습니다.

---

## 5. 향후 계획 및 개선점

- **전투 시스템:** 몬스터와의 전투 로직 및 시각적 연출을 구현합니다.
- **장비 시스템:** 장비 획득, 강화, 장착 기능을 추가합니다.
- **오프라인 보상:** 사용자가 접속하지 않은 시간에 대한 보상 로직을 구현합니다.
- **UI/UX 개선:** Web Components를 도입하여 UI를 컴포넌트화하고, 시각적 효과와 애니메이션을 추가하여 게임 경험을 향상시킵니다.
