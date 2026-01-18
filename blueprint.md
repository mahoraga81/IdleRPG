# Idle RPG 프로젝트 청사진

이 문서는 Idle RPG 프로젝트의 개발 계획, 아키텍처, 디자인 원칙 및 구현 단계를 기록하는 중앙 허브 역할을 합니다.

## 1. 애플리케이션 개요

**Idle RPG**는 사용자가 최소한의 조작으로 캐릭터를 성장시키는 방치형 웹 게임입니다. 사용자는 Google 계정으로 로그인하고, 캐릭터는 자동으로 몬스터와 싸우며 성장합니다. 이 프로젝트는 Cloudflare Pages에 배포되며, 정적 프론트엔드와 서버리스 Functions API를 결합한 현대적인 웹 아키텍처를 사용합니다.

## 2. 핵심 기능

- **Google 계정 기반 인증:** Cloudflare Pages Functions를 이용한 안전한 OAuth 2.0 로그인.
- **자동 전투 시스템:** 사용자가 보고 있지 않아도 캐릭터는 계속해서 전투하고 재화를 획득합니다.
- **캐릭터 성장:** 전투를 통해 경험치와 골드를 획득하여 레벨업하고 능력치를 강화합니다.
- **실시간 데이터 동기화:** Cloudflare D1 데이터베이스를 사용하여 모든 사용자 데이터를 저장하고 동기화합니다.

## 3. 기술 스택

- **프론트엔드:** 순수 HTML, CSS, JavaScript (프레임워크 없음)
- **백엔드 (API):** Cloudflare Pages Functions (JavaScript)
- **데이터베이스:** Cloudflare D1 (SQLite 기반 서버리스 데이터베이스)
- **인증:** Google OAuth 2.0
- **배포:** Cloudflare Pages
- **개발 환경:** Firebase Studio IDE

## 4. 구현 및 디버깅 기록

이 섹션은 프로젝트 개발 중 발생했던 주요 문제들과 해결 과정을 시간 순서대로 기록합니다.

### 4.1. 기능 구현: Google OAuth 로그인
- **목표:** 사용자가 Google 계정으로 안전하게 로그인할 수 있는 기능을 구현합니다.
- **구현:**
  - `functions/api/auth/google/login.js`: 사용자를 Google 로그인 페이지로 리디렉션하는 서버리스 함수.
  - `functions/api/auth/google/callback.js`: Google로부터 인증 코드를 받아 사용자 정보를 조회하고, 세션 쿠키를 생성하여 응답 헤더에 담아주는 서버리스 함수.
  - `functions/_middleware.js`: 모든 요청을 가로채 세션 쿠키를 검증하고, 유효한 경우 사용자 정보를 요청 객체에 추가하는 미들웨어.
  - `index.html`: "Login with Google" 버튼을 포함하며, 이 버튼은 `/api/auth/google/login` 경로로 연결됩니다.

### 4.2. 배포 오류 디버깅 (Cloudflare Worker vs. Pages)
- **초기 문제:** Cloudflare에 배포 후 `idlerpg.mahoraga81.workers.dev` 주소에서 계속해서 `404 Not Found` 오류가 발생했습니다.
- **과정 1: `wrangler.jsonc` 시도:** `npx wrangler deploy` 명령어 실패 로그를 기반으로, 배포 대상을 지정하는 `wrangler.jsonc` 파일을 생성하고 수정했으나 동일한 오류가 반복되었습니다.
- **과정 2: `public` 디렉터리 구조 변경:** 배포할 정적 에셋을 모으기 위해 `public` 디렉터리를 만들고 파일을 옮겼으나, 근본적인 배포 방식의 문제로 인해 실패했습니다.
- **근본 원인 식별:** Cloudflare 프로젝트 설정에서 **"Build output directory"** 입력란이 없다는 사실을 통해, 프로젝트가 웹사이트용 **"Pages"**가 아닌 서버 코드용 **"Worker"**로 잘못 생성되었음을 최종적으로 확인했습니다. `*.workers.dev` 주소 자체가 이 문제의 증거였습니다.
- **최종 해결 조치:**
  1. 기존의 잘못된 **Worker** 프로젝트(`idlerpg`)를 Cloudflare 대시보드에서 완전히 **삭제**했습니다.
  2. **Pages** 타입으로 새로운 애플리케이션을 생성했습니다.
  3. GitHub 저장소(`mahoraga81/IdleRPG`)를 연결했습니다.
  4. 빌드 설정에서 **`Build command`는 비워두고**, **`Build output directory`를 `public`으로** 정확히 지정했습니다.
  5. 배포 후, `*.pages.dev` 형태의 새로운 주소를 부여받아 404 문제가 완전히 해결되었습니다.

### 4.3. Google OAuth 리디렉션 URI 문제 해결
- **문제:** 새롭게 `pages.dev` 주소로 배포한 후, Google 로그인이 "redirect_uri_mismatch" 오류를 반환했습니다.
- **원인:** Google Cloud Console에 등록된 리디렉션 URI가 이전의 잘못된 `workers.dev` 주소로 남아있었습니다.
- **해결:** Google Cloud Console의 OAuth 2.0 클라이언트 ID 설정에서, **승인된 리디렉션 URI**를 **새로운 `https://<project-name>.pages.dev/api/auth/google/callback`** 주소로 업데이트하여 문제를 해결했습니다.

## 5. 향후 계획 및 개선점

- **전투 시스템:** 몬스터와의 전투 로직 및 시각적 연출을 구현합니다.
- **장비 시스템:** 장비 획득, 강화, 장착 기능을 추가합니다.
- **오프라인 보상:** 사용자가 접속하지 않은 시간에 대한 보상 로직을 구현합니다.
- **UI/UX 개선:** Web Components를 도입하여 UI를 컴포넌트화하고, 시각적 효과와 애니메이션을 추가하여 게임 경험을 향상시킵니다.
