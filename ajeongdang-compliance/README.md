# 아정당 준법심의번호 통합 관리

사내 준법감시 + 생명보험협회/손해보험협회 광고심의필 통합 관리 도구.
Vite + React + Tailwind v4 + Supabase(Auth · Postgres · Edge Functions) / Vercel.

## 기능
- 심의구분 통합 + 매체/상태/검색 필터, 유효기간 만료 추적, 사용처(채널+URL) 추적
- 사내준법 번호 자동 생성(아정당 준법심의필 제2026-0001호)
- 개인별 회사 이메일 로그인 + 초대 메일 기반 초기 비밀번호 설정
- 역할 기반 권한
  - 관리자(admin): 직원 초대/삭제, 역할 변경, 관리자 인계, 심의 등록/수정/삭제
  - 직원(staff): 심의 등록/수정만 (삭제 불가)

---

## 1. 로컬 실행
    npm install
    cp .env.example .env      # Supabase URL / anon key 입력
    npm run dev

## 2. Supabase 준비
1. supabase.com 프로젝트 생성
2. SQL Editor 에 supabase/schema.sql 실행 → 테이블 + profiles(역할) + RLS + 함수 생성
3. Settings > API 에서 Project URL, anon public 키 복사 → .env 및 Vercel 환경변수

### 2-1. 가입 차단 + 최초 관리자
- Authentication > Providers > Email : 공개 가입(Allow new users to sign up) 끄기
- 최초 관리자: Authentication > Users > Invite user 로 kane@ajd.co.kr 초대
  - schema.sql 트리거가 이 이메일을 자동으로 admin 으로 지정.
  - 다른 이메일로 바꾸려면 schema.sql 의 handle_new_user() 안 kane@ajd.co.kr 수정.
- 이후 직원 초대는 앱 안의 "직원 관리" 버튼(관리자 전용)에서 진행.

### 2-2. 초대/재설정 메일이 앱으로 돌아오게
- Authentication > URL Configuration
  - Site URL = 배포 도메인 (예: https://ajeongdang-compliance.vercel.app)
  - Redirect URLs 에 배포 도메인 + http://localhost:5173 추가
- 메일 발송(중요): Supabase 기본 내장 메일은 발송량이 매우 제한적(시간당 소량).
  직원 여러 명 초대 시 지연/누락 가능 → Authentication > SMTP Settings 에
  회사 메일/SendGrid/Resend 등 SMTP 연결 권장.
  폴백: 관리자가 대시보드 Users 에서 직접 Invite/재발송.

## 3. Edge Functions 배포 (직원 초대/삭제용)
직원 계정 생성/삭제는 service_role 권한이 필요 → 서버(Edge Function)에서만 처리.
(역할 변경/관리자 인계는 Function 없이 DB 함수/정책으로 처리 → 배포 대상 아님)

    # 1) Supabase CLI 설치 (한 번만)
    npm install -g supabase          # 또는 brew install supabase/tap/supabase

    # 2) 로그인 & 프로젝트 연결
    supabase login                   # 브라우저 인증
    supabase link --project-ref <프로젝트-ref>   # Settings > General 에서 ref 확인

    # 3) 두 함수 배포
    supabase functions deploy invite-user
    supabase functions deploy delete-user

- SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY 는 Edge Function 실행 환경에
  자동 주입되므로 원칙적으로 별도 설정 불필요. 못 찾으면 수동 등록:
      supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service_role 키>
  service_role 키는 절대 프론트엔드/깃에 넣지 말 것. [자동 주입 동작은 버전에 따라 다를 수 있어 확인 권장]

## 4. Vercel 배포
1. GitHub 레포 푸시 → Vercel Import (Framework: Vite)
2. 레포 최상단에 package.json 이 오게 올리거나, 폴더째 올렸다면
   Settings > Build and Deployment > Root Directory 를 ajeongdang-compliance 로 지정
3. Environment Variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 등록 후 Redeploy
4. 배포 도메인을 2-2 의 Site URL / Redirect URLs 에 반영

---

## 권한 구조 (요약)
| 동작 | 직원(staff) | 관리자(admin) | 강제 방식 |
|---|---|---|---|
| 심의 조회/등록/수정 | O | O | RLS |
| 심의 삭제 | X | O | RLS (is_admin) |
| 직원 초대/삭제 | X | O | Edge Function + 서버 admin 검증 |
| 역할 변경 | X | O | RLS (profiles update = admin) |
| 관리자 인계 | X | O | RPC transfer_admin (원자적) |

- 버튼 숨김뿐 아니라 DB(RLS/함수)에서 막음. 직원이 API로 직접 삭제 호출해도 거부됨.
- 관리자 인계는 "본인=직원, 대상=관리자"를 한 트랜잭션으로 처리 → 관리자 0명 사고 방지.

## 브랜드
- 웹 컬러 #145CE6 (src/index.css 의 @theme --color-brand). 파생 톤(50~dark)은 근사값.
- 로고 public/ajd-logo.webp

## 한계
- 사내 번호 자동 생성은 클라이언트 최댓값+1(미리보기). 동시 발급 충돌 우려 시 Postgres 시퀀스/RPC 권장.
- 삭제는 물리 삭제. 이력 보존 필요 시 result 에 "폐기" 상태 추가해 상태 변경 운영 권장.
- anon key 공개는 정상. 실제 보호는 RLS + 가입 차단이 담당.

## 파일 구조
    src/
      App.jsx                          세션+역할 게이트
      lib/supabase.js
      components/
        Login.jsx
        ResetPassword.jsx              초대/재설정 후 비번 설정
        ComplianceReviewManager.jsx    메인 (권한별 UI)
        AdminPanel.jsx                 직원/관리자 관리 (admin 전용)
    supabase/
      schema.sql
      functions/
        invite-user/index.ts
        delete-user/index.ts
