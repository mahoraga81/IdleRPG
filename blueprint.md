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

### 4.1. 기능 구현: Google OAuth 로그인 (Cloudflare 표준 방식)
- **목표:** 사용자가 Google 계정으로 안전하게 로그인할 수 있는 기능을 구현합니다.
- **초기 문제:** 복잡한 `_middleware.js` 파일이 Cloudflare의 기본 라우팅 시스템과 충돌하여 API 요청 시 404 오류가 발생했습니다.
- **해결:**
  - `_middleware.js`를 제거하고, 각 API 엔드포인트가 독립적으로 작동하도록 코드를 재구성했습니다.
  - `functions/api/login.js`: 사용자를 Google 로그인 페이지로 리디렉션하는 단순 함수.
  - `functions/api/callback.js`: Google로부터 인증 코드를 받아 사용자 정보를 처리하는 단순 함수.
  - 이 변경을 통해 Cloudflare Pages의 파일 기반 라우팅을 정상적으로 사용하게 되었습니다.

### 4.2. 배포 플랫폼 문제 디버깅 (Worker vs. Pages 프로젝트 타입)
- **증상:** 배포 후 `*.workers.dev` 주소에서 계속해서 `404 Not Found` 오류 발생. `Settings` 메뉴에 `Functions` 하위 메뉴와 `Environment variables` 추가 기능이 보이지 않음.
- **근본 원인:** Cloudflare에서 프로젝트가 **"Functions를 포함한 풀스택 사이트"**가 아닌, **"단순 정적 사이트(Static Site)"**로 잘못 분류되었음. 이로 인해 `functions` 폴더의 모든 코드가 배포에서 제외됨.
- **최종 해결 조치:**
  1. 기존의 잘못된 설정을 가진 프로젝트를 Cloudflare 대시보드에서 완전히 **삭제**했습니다.
  2. GitHub 저장소를 연결하여 **Pages** 프로젝트를 **재생성**했습니다.
  3. 프로젝트 생성 시, **`Build output directory`를 `public`으로** 명시적으로 지정하고, **`Framework preset`을 `None`**으로 설정하여 Cloudflare가 `functions` 폴더를 올바르게 인식하도록 유도했습니다.
  4. 환경 변수(`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)를 Cloudflare Pages 설정에 안전하게 등록했습니다.
  5. 배포 후, `idlerpg.pages.dev` 라는 새로운 주소를 부여받아 모든 기능이 정상 작동하는 것을 확인했습니다.

### 4.3. 기능 구현: Cloudflare D1 데이터베이스 연동 및 경합 조건 해결
- **목표:** 사용자의 계정 정보, 캐릭터 데이터, 세션을 저장하고 관리합니다.
- **구현:**
  - Cloudflare D1 데이터베이스 `idlerpg_db`를 생성하고 `users`, `sessions` 테이블을 정의했습니다.
  - Cloudflare Pages 프로젝트에 D1 바인딩을 추가했습니다.
- **주요 문제:** 최초 로그인 시, 동시 요청으로 인한 경합 조건(Race Condition)과 D1의 복제 지연(Replication Lag) 문제로 `UNIQUE constraint failed` 오류가 지속적으로 발생했습니다.
- **해결 과정:**
  1. **1차 시도 (SELECT 후 INSERT):** 단순 조회 후 생성하는 방식. 경합 조건에 실패.
  2. **2차 시도 (재시도 추가):** INSERT 실패 시 SELECT를 재시도했으나, 복제 지연으로 실패.
  3. **3차 시도 (지연 추가):** 재시도 전 고정된 시간(250ms)을 기다렸으나, 지연 시간이 충분하지 않아 실패.
  4. **4차 시도 (재시도 루프):** 점진적으로 증가하는 대기 시간을 가진 재시도 루프를 구현했으나, 근본적인 접근 방식의 한계로 실패.
  5. **5차 시도 (EAFP 패턴):** "일단 INSERT하고, 실패하면 SELECT"하는 패턴을 시도했으나, 복잡성만 증가하고 문제 해결에 실패.
- **최종 해결 (원자적 UPSERT):**
  - 모든 애플리케이션 수준의 재시도 로직을 폐기했습니다.
  - 데이터베이스의 원자적 연산을 보장하는 `INSERT ... ON CONFLICT ... DO UPDATE` (UPSERT) 쿼리를 `callback.js`에 적용했습니다.
  - 이 단일 쿼리는 데이터베이스 수준에서 경합 조건을 원천적으로 제거하여, 복잡한 재시도나 추측 없이 문제를 100% 해결했습니다.

### 4.4. UI/UX 개선: 로그인/게임 화면 분리
- **목표:** 사용자가 로그인 상태를 명확하게 인지할 수 있도록 UI를 개선합니다.
- **구현 계획:**
  - `index.html`: 로그인 UI를 위한 `#login-view`와 게임 UI를 위한 `#game-view`로 구조를 분리합니다.
  - `style.css`: `.hidden` 클래스를 추가하여 뷰를 숨기는 데 사용합니다.
  - `main.js`: 페이지 로드 시 `/api/me`를 호출하여, 응답 결과에 따라 `#login-view` 또는 `#game-view` 중 하나만 표시하도록 동적으로 제어합니다.

## 5. 향후 개발 계획: 자동 전투 시스템

이 섹션은 앞으로 구현할 자동 전투 시스템의 세부 요구사항을 정의합니다.
... (이하 생략)
