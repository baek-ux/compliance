# 아정당 준법심의번호 통합 관리 (Google 로그인 버전)

사내 준법감시 + 생명/손해보험협회 광고심의필 통합 관리 도구.
Vite + React + Tailwind v4 + Supabase(Auth: Google / Postgres) / Vercel.

## 인증 · 권한
- **로그인 = 회사 Google 계정(ajd.co.kr)** 만. 그 외 도메인은 자동 로그아웃.
- 역할 3단계:
  - **viewer(뷰어)** — 열람만. 첫 로그인 시 기본값.
  - **editor(편집자)** — 심의 등록·수정 (삭제 X).
  - **admin(관리자)** — 삭제 + 역할 부여/인계. `alic@ajd.co.kr` 1명(트리거 자동).
- 전산관리자(너)는 앱 역할이 아니라 Supabase 접근 권한으로 존재 → 비상 시 SQL로 복구.

## 1. 로컬 실행
    npm install
    cp .env.example .env      # Supabase URL / anon key
    npm run dev

## 2. Supabase 준비
1. SQL Editor 에 supabase/schema.sql 실행 (테이블 + 3단계 역할 + RLS + 함수)
2. Settings > API 의 Project URL, anon public 키 → .env / Vercel 환경변수

## 3. Google 로그인 연결 (핵심)
GCP 와 Supabase 를 서로 물려줘야 한다.

### 3-1. GCP (console.cloud.google.com)
- 프로젝트(예: ajd-compliance-auth) → "Google 인증 플랫폼"
- 대상(Audience) = **Internal** (ajd.co.kr 조직 전용)
- 클라이언트 생성: 유형 "웹 애플리케이션"
- **승인된 리디렉션 URI** 에 Supabase 콜백 추가:
  `https://<프로젝트ref>.supabase.co/auth/v1/callback`
- 발급된 **Client ID / Client Secret** 복사

### 3-2. Supabase (Authentication > Providers > Google)
- Client ID / Client Secret 붙여넣기 → **Enable** 토글 ON → Save
- 화면의 Callback URL 이 3-1의 리디렉션 URI 와 일치하는지 확인

### 3-3. URL Configuration (Authentication > URL Configuration)
- **Site URL** = `https://compliance-sandy.vercel.app`
- **Redirect URLs** 에 추가:
  - `https://compliance-sandy.vercel.app/**`
  - `http://localhost:5173/**` (로컬 테스트용)

## 4. Vercel 배포
- GitHub 푸시 → Vercel Import (Framework: Vite)
- 폴더째 올렸으면 Settings > Root Directory 를 ajeongdang-compliance 로
- Environment Variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY

## 5. 최고관리자(alic) 지정
- schema.sql 트리거가 `alic@ajd.co.kr` 첫 로그인 시 자동 admin.
- 혹시 admin 이 안 잡히면 SQL 한 줄로 보정:
      update public.profiles set role='admin' where email='alic@ajd.co.kr';
- 다른 사람을 최고관리자로 하려면 schema.sql 의 handle_new_user() 안 이메일 수정.

## 권한 구조 (요약)
| 동작 | viewer | editor | admin | 강제 |
|---|---|---|---|---|
| 조회 | O | O | O | RLS |
| 등록·수정 | X | O | O | RLS can_edit() |
| 삭제 | X | X | O | RLS is_admin() |
| 역할 부여·인계 | X | X | O | RLS + RPC transfer_admin |

- 버튼 숨김뿐 아니라 DB(RLS)에서 막음. 뷰어가 API로 직접 등록/삭제 호출해도 거부.
- 직원 목록은 "한 번이라도 로그인한" 사람만 나타남(구글 로그인 시 자동 생성, 기본 viewer).
- 관리자가 "차단"해도 회사 구글 계정이면 재로그인 시 viewer 로 재생성됨(도메인 허용 정책상). 완전 차단은 화이트리스트가 필요하나 현재 정책은 "사내 전원 열람 허용".

## 한계
- 사내 번호 자동 생성은 클라이언트 최댓값+1(미리보기). 동시 발급 충돌 우려 시 시퀀스/RPC 권장.
- 삭제는 물리 삭제. 이력 보존이 필요하면 result 에 "폐기" 상태 추가 운영 권장.

## 파일 구조
    src/
      App.jsx                        세션+도메인검증+역할 게이트
      lib/supabase.js
      components/
        Login.jsx                    Google 로그인 버튼
        ComplianceReviewManager.jsx  메인 (권한별 UI)
        AdminPanel.jsx               역할 관리 (admin 전용)
    supabase/schema.sql              테이블 + 3단계 역할 + RLS + transfer_admin
