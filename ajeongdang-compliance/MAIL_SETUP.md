# 마감임박 심의 자동 메일 발송 설정 가이드

매일 오전 9시(KST) 곧 만료되는 심의를 스캔해 준법 관리 팀장(alic@ajd.co.kr)에게 1통 발송합니다.
- 외부심의(생보/손보): D-30 이내
- 내부심의(사내준법): D-10 이내
- 이미 만료된 건 제외 · 담당자명 정렬 · 외부/내부 섹션 구분

구성: Supabase Edge Function(`notify-expiring`) + Resend(메일 발송) + pg_cron(매일 자동 실행)

---

## 1. Resend 준비 (메일 발송 서비스)

1. https://resend.com 가입
2. API Keys → **Create API Key** → 키 복사 (한 번만 보임)
3. 발신 주소 선택:
   - **바로 쓰기:** `onboarding@resend.dev` (Resend 기본, 인증 불필요) — 테스트/내부용 충분
   - **회사 도메인:** `noreply@ajd.co.kr` — Resend에서 도메인 추가 후 DNS(SPF/DKIM) 등록 필요(관리자 협조)
   - 처음엔 기본 주소로 시작 권장. 나중에 도메인 인증 후 교체.

---

## 2. Edge Function 배포

로컬에서 (Supabase CLI 설치돼 있어야):

    supabase functions deploy notify-expiring --no-verify-jwt

`--no-verify-jwt`: cron/외부에서 호출할 수 있게 JWT 검증 끔(이 함수는 서비스롤로 내부 조회만 함).

---

## 3. Function 환경변수(Secrets) 등록

    supabase secrets set RESEND_API_KEY="re_xxxxxxxx"
    supabase secrets set NOTIFY_TO="alic@ajd.co.kr"
    supabase secrets set NOTIFY_FROM="onboarding@resend.dev"

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`는 자동 주입되므로 넣지 않습니다(넣으려 하면 CLI가 막습니다).
- 대시보드에서도 가능: Edge Functions → notify-expiring → Secrets.

---

## 4. 발송 테스트 (cron 걸기 전 수동 확인)

대시보드 → Edge Functions → notify-expiring → **Invoke** 하거나:

    curl -X POST "https://<프로젝트ref>.supabase.co/functions/v1/notify-expiring" \
      -H "Authorization: Bearer <anon key>"

- 결과 JSON: `{"ok":true,"sent":true,...}` 이면 발송됨 → alic 메일함 확인
- `{"ok":true,"sent":false,"reason":"임박 건 없음"}` 이면 지금 임박 건이 없다는 뜻(정상). 테스트하려면 임의 심의의 유효종료일을 오늘+20일로 바꿔두고 다시 호출.
- 에러면 메시지 확인 (RESEND_API_KEY/NOTIFY_TO 누락, 발신주소 미인증 등)

---

## 5. 매일 09:00 KST 자동 실행 (pg_cron)

Supabase 대시보드 → SQL Editor 에서 실행:

    -- 확장 활성화(최초 1회)
    create extension if not exists pg_cron;
    create extension if not exists pg_net;

    -- 매일 00:00 UTC = 09:00 KST 에 함수 호출
    select cron.schedule(
      'notify-expiring-daily',
      '0 0 * * *',
      $$
      select net.http_post(
        url := 'https://<프로젝트ref>.supabase.co/functions/v1/notify-expiring',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer <anon key>'
        )
      );
      $$
    );

- `<프로젝트ref>` = lxvhvhydppyvnioiwczw
- `<anon key>` = Settings → API 의 anon public 키
- 등록 확인: `select * from cron.job;`
- 해제: `select cron.unschedule('notify-expiring-daily');`

> pg_cron 시각은 UTC 기준입니다. 09:00 KST = 00:00 UTC 라 `0 0 * * *`.
> 서머타임 없는 한국 기준이므로 고정입니다.

---

## 바꾸고 싶을 때
- 수신자 변경/추가: `NOTIFY_TO` 시크릿 수정 (여러 명이면 함수의 `to:[TO]`를 배열로 확장 필요 — 요청 시 수정).
- 임박 기준(D-30/D-10) 변경: 함수 상단 `EXTERNAL_DAYS`, `INTERNAL_DAYS` 수정 후 재배포.
- 발송 시각 변경: cron 표현식 수정(재등록).
- 임박 건 없을 때도 "오늘 임박 없음" 메일을 받고 싶으면: 함수의 "임박 건 0이면 스킵" 부분을 제거(요청 시 수정).
