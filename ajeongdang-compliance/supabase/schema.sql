-- ============================================================
-- 준법심의번호 관리 : 테이블 + email 기반 역할  [네이버웍스 직접 로그인 버전]
-- 로그인은 네이버웍스(OIDC)로 앱에서 직접 처리, Supabase 는 DB 로만 사용.
-- 사용자 uuid 가 없으므로 역할은 email 기준(app_roles)으로 관리.
-- 최고관리자(admin)는 앱 코드에 고정: alic@ajd.co.kr (App.jsx ADMIN_EMAIL)
--
-- 주의: 현재 RLS 를 강제하지 않는다(사내 내부도구, 민감 고객정보 아님 전제).
--       anon key 로 읽고 쓰므로 DB 단 접근통제는 없다. 권한은 앱 화면에서만 분기.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행 (재실행 안전).
-- ============================================================

-- ---------- 1. 심의번호 테이블 ----------
create table if not exists public.review_number (
  id            bigint generated always as identity primary key,
  category      text not null,
  review_no     text,
  title         text not null,
  media_type    text,
  product       text,
  applied_date  date,
  reviewed_date date,
  result        text,
  valid_from    date,
  valid_to      date,
  applicant     text,
  approver      text,
  usages        jsonb not null default '[]'::jsonb,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_review_number_updated on public.review_number;
create trigger trg_review_number_updated
  before update on public.review_number
  for each row execute function public.set_updated_at();

-- ---------- 2. 역할 테이블 (email 기반) ----------
create table if not exists public.app_roles (
  email      text primary key,
  role       text not null default 'viewer' check (role in ('viewer','editor','admin')),
  created_at timestamptz not null default now()
);

-- ---------- 3. RLS 설정 ----------
-- RLS 를 켜되, authenticated 가 아닌 anon 로 접근하므로 정책을 열어둔다.
-- (네이버웍스 직접 로그인은 Supabase 세션을 만들지 않아 요청이 anon 으로 나감)
-- => 사실상 통제 없음. 앱 화면에서 역할 분기. 민감정보 저장 금지.
alter table public.review_number enable row level security;
alter table public.app_roles     enable row level security;

drop policy if exists "rn all" on public.review_number;
create policy "rn all" on public.review_number
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "ar all" on public.app_roles;
create policy "ar all" on public.app_roles
  for all to anon, authenticated using (true) with check (true);

-- ---------- 4. (선택) 예시 심의 데이터 ----------
insert into public.review_number
  (category, review_no, title, media_type, product, applied_date, reviewed_date, result, valid_from, valid_to, applicant, approver, usages, note)
values
  ('사내준법', '아정당 준법심의필 제2025-0142호', '제휴카드 X 보험 크로스셀 블로그 포스팅', '블로그', '통신·렌탈 제휴카드 연계',
   current_date - 18, current_date - 12, '승인', current_date - 12, current_date + 80, '정전략', '준법감시인',
   '[{"channel":"블로그","url":"https://blog.naver.com/ajeongdang/223011"}]'::jsonb, null),
  ('사내준법', '아정당 준법심의필 제2025-0139호', '다이렉트 보험 소개 유튜브 영상', '영상', '다이렉트 운전자보험',
   current_date - 50, current_date - 44, '승인', current_date - 44, current_date + 18, '박기획', '준법감시인',
   '[{"channel":"영상","url":"https://youtu.be/xxxxxxx"}]'::jsonb, '만료 임박'),
  ('손보협회', '손보 2025-A-00891', '운전자보험 랜딩페이지', '랜딩페이지', '다이렉트 운전자보험 / B화재',
   current_date - 70, current_date - 60, '조건부승인', current_date - 60, current_date + 120, '박기획', '준법감시인',
   '[{"channel":"랜딩페이지","url":"https://event.ajeongdang.co.kr/driver"}]'::jsonb,
   '[조건부] 보장한도 각주 추가·예시보험료 기준 명시 (기한 승인일+14일) / 이행보고 미제출')
on conflict do nothing;
