-- ============================================================
-- 준법심의번호 관리 : 테이블 + 역할(profiles) + RLS + 함수
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행.
-- (여러 번 실행해도 되도록 최대한 idempotent 하게 작성)
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

-- ---------- 2. 사용자 역할 테이블 (profiles) ----------
-- auth.users 와 1:1. 계정 삭제 시 함께 삭제.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  role       text not null default 'staff' check (role in ('staff','admin')),
  must_set_password boolean not null default true,
  created_at timestamptz not null default now()
);

-- 기존 프로젝트에 컬럼이 없으면 추가 (재실행 안전)
alter table public.profiles
  add column if not exists must_set_password boolean not null default true;

-- 부트스트랩 관리자 이메일(최초 1명). 이 계정은 생성 시 자동으로 admin.
-- 회사 사정에 맞게 바꾸세요.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  desired_role text;
begin
  desired_role := coalesce(new.raw_user_meta_data->>'role', 'staff');
  if new.email = 'kane@ajd.co.kr' then
    desired_role := 'admin';
  end if;
  insert into public.profiles (id, email, role)
  values (new.id, new.email, desired_role)
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 이미 kane 계정이 존재한다면 아래로 승격 (없으면 아무 일도 안 함)
update public.profiles set role = 'admin' where email = 'kane@ajd.co.kr';

-- ---------- 3. 역할 확인 함수 (RLS 재귀 방지용, SECURITY DEFINER) ----------
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- ---------- 4. RLS : review_number ----------
alter table public.review_number enable row level security;

drop policy if exists "rn read"   on public.review_number;
drop policy if exists "rn insert" on public.review_number;
drop policy if exists "rn update" on public.review_number;
drop policy if exists "rn delete" on public.review_number;

-- 조회/등록/수정: 로그인한 사용자 모두 (직원 = 수정까지)
create policy "rn read"   on public.review_number for select to authenticated using (true);
create policy "rn insert" on public.review_number for insert to authenticated with check (true);
create policy "rn update" on public.review_number for update to authenticated using (true) with check (true);
-- 삭제: 관리자만
create policy "rn delete" on public.review_number for delete to authenticated using (public.is_admin());

-- ---------- 5. RLS : profiles ----------
alter table public.profiles enable row level security;

drop policy if exists "pf read"   on public.profiles;
drop policy if exists "pf update" on public.profiles;

-- 본인 행은 읽기 가능, 관리자는 전체 읽기
create policy "pf read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
-- 역할 변경(update)은 관리자만. insert/delete 는 트리거/Edge Function(service_role)이 처리.
create policy "pf update" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- 6. 관리자 인계 (원자적) ----------
-- 호출자(현 관리자)를 staff 로, 대상(target_id)을 admin 으로 한 번에 변경.
create or replace function public.transfer_admin(target_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 인계할 수 있습니다.';
  end if;
  if target_id = auth.uid() then
    raise exception '본인에게는 인계할 수 없습니다.';
  end if;
  update public.profiles set role = 'admin' where id = target_id;
  update public.profiles set role = 'staff' where id = auth.uid();
end $$;

grant execute on function public.transfer_admin(uuid) to authenticated;

-- ---------- 6-1. 본인 비번설정 완료 표시 (role 은 못 건드림) ----------
create or replace function public.mark_password_set()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set must_set_password = false where id = auth.uid();
end $$;

grant execute on function public.mark_password_set() to authenticated;

-- ---------- 7. (선택) 예시 심의 데이터 ----------
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
