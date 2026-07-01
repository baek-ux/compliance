-- ============================================================
-- 준법심의번호 관리 테이블 + RLS
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
-- ============================================================

create table if not exists public.review_number (
  id            bigint generated always as identity primary key,
  category      text not null,              -- 사내준법 / 생보협회 / 손보협회
  review_no     text,                       -- 심의번호 (사내는 자동생성, 협회는 수동)
  title         text not null,              -- 자료명
  media_type    text,                       -- 대표 매체
  product       text,                       -- 상품 / 제휴사
  applied_date  date,
  reviewed_date date,
  result        text,                       -- 심사중/승인/조건부승인/부적합/재심
  valid_from    date,
  valid_to      date,
  applicant     text,
  approver      text,
  usages        jsonb not null default '[]'::jsonb,  -- [{channel, url}, ...]
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_review_number_updated on public.review_number;
create trigger trg_review_number_updated
  before update on public.review_number
  for each row execute function public.set_updated_at();

-- ============================================================
-- RLS: 로그인(authenticated)한 사용자만 접근. anon 은 전면 차단.
-- ============================================================
alter table public.review_number enable row level security;

drop policy if exists "auth read"   on public.review_number;
drop policy if exists "auth insert" on public.review_number;
drop policy if exists "auth update" on public.review_number;
drop policy if exists "auth delete" on public.review_number;

create policy "auth read"   on public.review_number for select to authenticated using (true);
create policy "auth insert" on public.review_number for insert to authenticated with check (true);
create policy "auth update" on public.review_number for update to authenticated using (true) with check (true);
create policy "auth delete" on public.review_number for delete to authenticated using (true);

-- ============================================================
-- (선택) 초기 예시 데이터 몇 건. 필요 없으면 지우세요.
-- ============================================================
insert into public.review_number
  (category, review_no, title, media_type, product, applied_date, reviewed_date, result, valid_from, valid_to, applicant, approver, usages, note)
values
  ('사내준법', '아정당 준법심의필 제2025-0142호', '제휴카드 X 보험 크로스셀 블로그 포스팅', '블로그', '통신·렌탈 제휴카드 연계',
   current_date - 18, current_date - 12, '승인', current_date - 12, current_date + 80, '정전략', '준법감시인 이감시',
   '[{"channel":"블로그","url":"https://blog.naver.com/ajeongdang/223011"}]'::jsonb, null),
  ('사내준법', '아정당 준법심의필 제2025-0139호', '다이렉트 보험 소개 유튜브 영상', '영상', '다이렉트 운전자보험',
   current_date - 50, current_date - 44, '승인', current_date - 44, current_date + 18, '박기획', '준법감시인 이감시',
   '[{"channel":"영상","url":"https://youtu.be/xxxxxxx"}]'::jsonb, '만료 임박'),
  ('손보협회', '손보 2025-A-00891', '운전자보험 랜딩페이지', '랜딩페이지', '다이렉트 운전자보험 / B화재',
   current_date - 70, current_date - 60, '조건부승인', current_date - 60, current_date + 120, '박기획', '준법감시인 이감시',
   '[{"channel":"랜딩페이지","url":"https://event.ajeongdang.co.kr/driver"}]'::jsonb,
   '[조건부] 보장한도 각주 추가·예시보험료 기준 명시 (기한 승인일+14일) / 이행보고 미제출');
