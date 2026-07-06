-- ============================================================
-- 준법심의번호 관리 : 테이블 + 역할(3단계) + RLS  [Google 로그인 버전]
-- 역할: viewer(열람) / editor(등록·수정) / admin(삭제·역할부여)
-- 최고관리자(admin) 1명 = alic@ajd.co.kr (트리거 자동 지정)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행 (재실행 안전)
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

-- ---------- 2. 사용자 역할 (profiles) ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  role       text not null default 'viewer' check (role in ('viewer','editor','admin')),
  created_at timestamptz not null default now()
);

-- 기존 프로젝트 호환: check 제약이 예전(staff/admin)이면 교체
do $$
begin
  alter table public.profiles drop constraint if exists profiles_role_check;
  alter table public.profiles add constraint profiles_role_check
    check (role in ('viewer','editor','admin'));
exception when others then null;
end $$;

-- 최고관리자 이메일(1명). 바꾸려면 이 값만 수정.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  desired_role text := 'viewer';
begin
  if new.email = 'alic@ajd.co.kr' then
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

-- 이미 alic 계정이 있으면 admin 으로 보정 (없으면 무동작)
update public.profiles set role = 'admin' where email = 'alic@ajd.co.kr';

-- ---------- 3. 역할 확인 함수 (RLS 재귀 방지) ----------
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

create or replace function public.can_edit()  -- editor 또는 admin
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('editor','admin'));
$$;

-- ---------- 4. RLS : review_number ----------
alter table public.review_number enable row level security;

drop policy if exists "rn read"   on public.review_number;
drop policy if exists "rn insert" on public.review_number;
drop policy if exists "rn update" on public.review_number;
drop policy if exists "rn delete" on public.review_number;

-- 조회: 로그인한 전원(viewer 포함)
create policy "rn read"   on public.review_number for select to authenticated using (true);
-- 등록·수정: editor 이상만
create policy "rn insert" on public.review_number for insert to authenticated with check (public.can_edit());
create policy "rn update" on public.review_number for update to authenticated using (public.can_edit()) with check (public.can_edit());
-- 삭제: admin 만
create policy "rn delete" on public.review_number for delete to authenticated using (public.is_admin());

-- ---------- 5. RLS : profiles ----------
alter table public.profiles enable row level security;

drop policy if exists "pf read"   on public.profiles;
drop policy if exists "pf update" on public.profiles;

-- 본인 행 읽기 + 관리자는 전체 읽기
create policy "pf read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
-- 역할 변경은 admin 만. insert 는 트리거(security definer)가 처리.
create policy "pf update" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- 6. 관리자 인계 (원자적) ----------
-- 호출자(현 admin)를 editor 로, 대상(target_id)을 admin 으로 한 번에.
create or replace function public.transfer_admin(target_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 인계할 수 있습니다.';
  end if;
  if target_id = auth.uid() then
    raise exception '본인에게는 인계할 수 없습니다.';
  end if;
  update public.profiles set role = 'admin'  where id = target_id;
  update public.profiles set role = 'editor' where id = auth.uid();
end $$;

grant execute on function public.transfer_admin(uuid) to authenticated;

-- ---------- 7. (선택) 예시 심의 데이터 ----------
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
   '[조건부] 보장한도 각주 추가·예시보험료 기준 명시 (기한 승인일+14일) / 이행보고 미제출');
