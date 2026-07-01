# 아정당 준법심의번호 통합 관리

사내 준법감시 + 생명보험협회 / 손해보험협회 광고심의필을 한 화면에서 관리하는 내부 도구.
Vite + React + Tailwind v4 + Supabase(Auth + Postgres) / Vercel 배포.

## 주요 기능
- 심의구분 통합(사내준법 / 생보협회 / 손보협회) + 매체/상태/검색 필터
- 유효기간 만료 추적 (유효 / 만료임박 D-30 / 만료됨) — 상단 배지에서 바로 필터
- 사내준법 번호 자동 생성(`아정당 준법심의필 제2026-0001호`), 협회 번호 수동 입력
- 사용처(채널 + URL) 다건 등록 — "이 번호가 어디에 붙었나" 추적
- 개인별 회사 이메일 로그인 + 셀프 비밀번호 재설정(메일)

---

## 1. 로컬 실행
```bash
npm install
cp .env.example .env      # .env 에 Supabase URL / anon key 입력
npm run dev
```

## 2. Supabase 준비
1. supabase.com 에서 프로젝트 생성
2. **SQL Editor** 에 `supabase/schema.sql` 붙여넣고 실행 (테이블 + RLS + 예시데이터)
3. **Settings > API** 에서 `Project URL` 과 `anon public` 키를 복사 → `.env` 및 Vercel 환경변수에 입력

### 2-1. 로그인 계정은 "관리자 발급"으로 (중요)
기본값은 누구나 가입 가능하므로 반드시 잠급니다.
- **Authentication > Providers > Email**: `Enable Signup` **끄기** (셀프 가입 차단)
- **Authentication > Users > Add user / Invite** 로 팀원 이메일 계정을 관리자가 직접 발급
- Invite 메일을 받은 사용자가 비밀번호를 설정하면 로그인 가능

### 2-2. 비밀번호 재설정 메일이 앱으로 돌아오게
- **Authentication > URL Configuration**
  - `Site URL` = 배포 도메인 (예: `https://ajeongdang-compliance.vercel.app`)
  - `Redirect URLs` 에 위 도메인과 `http://localhost:5173` 추가
- 앱의 "비밀번호를 잊으셨나요?" → 메일 링크 클릭 → 새 비밀번호 설정 화면으로 복귀
- (선택) **Authentication > Email Templates** 에서 재설정 메일 문구를 한글로 커스터마이즈

> 무료 플랜의 기본 메일은 발송량 제한이 있습니다. 실제 운영에서 안정적으로 보내려면
> SMTP(회사 메일/SendGrid 등)를 **Authentication > SMTP Settings** 에 연결하세요.

## 3. Vercel 배포
1. GitHub 레포에 푸시 후 Vercel 에서 Import (Framework: **Vite** 자동 감지)
2. **Settings > Environment Variables** 에 아래 2개 등록 후 재배포
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. 배포된 도메인을 위 2-2의 Site URL / Redirect URLs 에 반영

---

## 알아둘 점 / 한계
- **anon key 는 공개돼도 되는 키입니다.** 실제 보호는 코드가 아니라 위에서 건 **RLS + Signup 차단**이 담당합니다. RLS 를 끄면 로그인 UI 가 있어도 데이터가 노출됩니다.
- **사내 번호 자동 생성은 클라이언트에서 `기존 최댓값 +1`** 로 계산합니다(미리보기 성격). 여러 명이 동시에 발급하면 충돌 가능. 엄격한 연속 채번이 필요하면 Postgres 시퀀스나 RPC(서버 함수)로 옮기세요.
- 삭제는 물리 삭제입니다. 감사 목적상 이력 보존이 필요하면 `result` 에 "폐기" 상태를 추가하고 삭제 대신 상태 변경으로 운영하는 방식을 권장합니다.

## 파일 구조
```
src/
  App.jsx                          세션 게이트 (로그인/재설정/앱 분기)
  lib/supabase.js                  Supabase 클라이언트
  components/
    Login.jsx                      이메일+비번 로그인 / 비번찾기
    ResetPassword.jsx              메일 링크 후 새 비번 설정
    ComplianceReviewManager.jsx    메인 관리 화면 (CRUD)
supabase/schema.sql                테이블 + RLS + 예시데이터
```
