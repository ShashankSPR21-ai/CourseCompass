-- ============================================================================
-- CourseCompass – coordinator / admin-approval workflow
--
-- WHAT THIS DOES
--   1. One coordinator per college   (profiles.college_id, unique for coordinators)
--   2. Signup: students are auto-approved, coordinators start "pending"
--      (role can only ever be student or coordinator at signup – never admin)
--   3. Users can no longer edit their own role / approval / college
--   4. Coordinators never write to live tables. Every edit becomes a row in
--      public.change_requests which an admin approves or rejects.
--      Students only ever see the live (approved) data.
--   5. College photo bucket "college-photos" (coordinator uploads, own folder)
--   6. Row-Level-Security rewritten for the tables below
--
-- HOW TO RUN
--   Supabase Dashboard → SQL Editor → paste this whole file → Run.
--   It is safe to run more than once.
--
-- ⚠ BEFORE YOU RUN (read me)
--   • Section 8 REPLACES every existing RLS policy on: profiles, colleges,
--     courses, college_programs, student_requests. This is required, because
--     any old "coordinators can update colleges" policy would let a coordinator
--     skip the approval step. To see what you have now, run first:
--         select tablename, policyname, cmd from pg_policies
--         where schemaname = 'public' order by 1, 2;
--   • Section 3 replaces the function public.handle_new_user() and the trigger
--     on auth.users that creates a profile. Check for other triggers with:
--         select tgname from pg_trigger
--         where tgrelid = 'auth.users'::regclass and not tgisinternal;
--     If you see a profile-creating trigger with a different name, drop it,
--     otherwise two triggers will both try to create the profile.
--   • Create your admin account by hand (SQL editor):
--         update public.profiles set role = 'admin', approval_status = 'approved'
--         where email = 'you@example.com';
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Columns
-- ----------------------------------------------------------------------------

-- profiles.college_id must have the SAME type as colleges.id (uuid or bigint…)
do $$
declare
  t text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into t
    from pg_attribute a
   where a.attrelid = 'public.colleges'::regclass
     and a.attname = 'id'
     and not a.attisdropped;

  execute format(
    'alter table public.profiles
       add column if not exists college_id %s
       references public.colleges(id) on delete set null',
    t
  );
end $$;

alter table public.profiles
  add column if not exists requested_college_id   text,
  add column if not exists requested_college_name text,
  add column if not exists requested_college_city text,
  add column if not exists phone                  text;

alter table public.colleges
  add column if not exists gallery_urls text[] not null default '{}';

-- ONE COORDINATOR PER COLLEGE – enforced by the database itself.
create unique index if not exists profiles_one_coordinator_per_college
  on public.profiles (college_id)
  where role = 'coordinator' and college_id is not null;


-- ----------------------------------------------------------------------------
-- 2. Helper functions (SECURITY DEFINER so RLS policies can use them safely)
-- ----------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- The college the signed-in user coordinates (NULL unless an approved coordinator)
create or replace function public.my_college_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.college_id::text
    from public.profiles p
   where p.id = auth.uid()
     and p.role = 'coordinator'
     and p.approval_status = 'approved';
$$;


-- ----------------------------------------------------------------------------
-- 3. Signup: choose student or coordinator
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta          jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role        text;
  v_req_id      text;
  v_req_name    text;
begin
  -- Only these two roles can be self-selected. "admin" can never be.
  v_role := case when meta->>'role' = 'coordinator' then 'coordinator' else 'student' end;

  if v_role = 'coordinator' then
    -- accept the requested college id only if it really exists
    select c.id::text into v_req_id
      from public.colleges c
     where c.id::text = meta->>'requested_college_id';
    v_req_name := nullif(left(btrim(coalesce(meta->>'requested_college_name', '')), 200), '');
  end if;

  insert into public.profiles (
    id, full_name, email, role, approval_status,
    requested_college_id, requested_college_name, requested_college_city, phone
  )
  values (
    new.id,
    left(coalesce(meta->>'full_name', ''), 200),
    new.email,
    v_role,
    case when v_role = 'coordinator' then 'pending' else 'approved' end,
    v_req_id,
    v_req_name,
    nullif(left(btrim(coalesce(meta->>'requested_college_city', '')), 100), ''),
    nullif(left(btrim(coalesce(meta->>'phone', '')), 30), '')
  )
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Colleges a new coordinator may ask to represent (visible BEFORE login, so
-- it is a function that only exposes id / name / city, never other columns).
create or replace function public.list_claimable_colleges()
returns table (id text, name text, city text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id::text, c.name, c.city
    from public.colleges c
   where not exists (
           select 1 from public.profiles p
            where p.college_id = c.id and p.role = 'coordinator'
         )
   order by c.name
   limit 2000;
$$;

revoke all on function public.list_claimable_colleges() from public;
grant execute on function public.list_claimable_colleges() to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 4. Users cannot promote themselves
-- ----------------------------------------------------------------------------

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is NULL for the SQL editor / service role: allowed.
  if auth.uid() is not null and not public.is_admin() then
    if new.role                   is distinct from old.role
    or new.approval_status        is distinct from old.approval_status
    or new.college_id             is distinct from old.college_id
    or new.requested_college_id   is distinct from old.requested_college_id
    or new.requested_college_name is distinct from old.requested_college_name
    or new.email                  is distinct from old.email
    or new.id                     is distinct from old.id then
      raise exception 'You are not allowed to change role, approval, email or college.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists protect_profile_columns on public.profiles;
create trigger protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();


-- ----------------------------------------------------------------------------
-- 5. Change requests (the "draft → publish → admin approves" workflow)
-- ----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into t
    from pg_attribute a
   where a.attrelid = 'public.colleges'::regclass
     and a.attname = 'id'
     and not a.attisdropped;

  execute format($f$
    create table if not exists public.change_requests (
      id           uuid primary key default gen_random_uuid(),
      college_id   %s not null references public.colleges(id) on delete cascade,
      entity       text not null check (entity in ('college', 'course')),
      action       text not null default 'update'
                   check (action in ('create', 'update', 'delete')),
      entity_id    text,
      payload      jsonb not null default '{}'::jsonb,
      summary      text,
      status       text not null default 'draft'
                   check (status in ('draft', 'pending', 'approved', 'rejected')),
      submitted_by uuid default auth.uid(),
      submitted_at timestamptz,
      admin_note   text,
      reviewed_by  uuid,
      reviewed_at  timestamptz,
      created_at   timestamptz not null default now(),
      updated_at   timestamptz not null default now()
    )$f$, t);
end $$;

-- one open request for the college profile, and one per course
create unique index if not exists change_requests_one_open_college
  on public.change_requests (college_id)
  where entity = 'college' and status in ('draft', 'pending', 'rejected');

create unique index if not exists change_requests_one_open_course
  on public.change_requests (college_id, entity_id)
  where entity = 'course' and entity_id is not null
    and status in ('draft', 'pending', 'rejected');

create index if not exists change_requests_status_idx
  on public.change_requests (status, created_at);

create or replace function public.change_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();

  if tg_op = 'INSERT' then
    if auth.uid() is not null and not public.is_admin() then
      new.submitted_by := auth.uid();
      new.admin_note   := null;
      new.reviewed_by  := null;
      new.reviewed_at  := null;
    end if;
    if new.status = 'pending' and new.submitted_at is null then
      new.submitted_at := now();
    end if;
    return new;
  end if;

  -- UPDATE
  if auth.uid() is not null and not public.is_admin() then
    if new.college_id is distinct from old.college_id
    or new.entity     is distinct from old.entity
    or new.action     is distinct from old.action
    or new.entity_id  is distinct from old.entity_id
    or new.admin_note is distinct from old.admin_note
    or new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at then
      raise exception 'Only an admin can change review fields.' using errcode = '42501';
    end if;
  end if;

  if new.status = 'pending' and old.status <> 'pending' then
    new.submitted_at := now();
    new.admin_note   := null;   -- a re-submission clears the old rejection note
  end if;

  return new;
end $$;

drop trigger if exists change_requests_guard on public.change_requests;
create trigger change_requests_guard
  before insert or update on public.change_requests
  for each row execute function public.change_requests_guard();


-- ----------------------------------------------------------------------------
-- 6. Admin functions
-- ----------------------------------------------------------------------------

-- helper: "col = r.col, …" for the payload keys that are real columns and not protected
create or replace function public._payload_set_clause(
  p_table text, p_payload jsonb, p_protected text[]
) returns text
language sql
stable
set search_path = public
as $$
  select string_agg(format('%1$I = r.%1$I', c.column_name), ', ')
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = p_table
     and p_payload ? c.column_name
     and c.column_name <> all (p_protected);
$$;

create or replace function public._payload_columns(
  p_table text, p_payload jsonb, p_protected text[]
) returns text
language sql
stable
set search_path = public
as $$
  select string_agg(format('%I', c.column_name), ', ')
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = p_table
     and p_payload ? c.column_name
     and c.column_name <> all (p_protected);
$$;

revoke all on function public._payload_set_clause(text, jsonb, text[]) from public;
revoke all on function public._payload_columns(text, jsonb, text[]) from public;

-- Approve a coordinator and attach them to ONE college.
--   • existing college: pass p_college (id as text)
--   • college not in the list: leave p_college NULL and pass p_new_name (+city)
create or replace function public.admin_approve_coordinator(
  p_user      uuid,
  p_college   text default null,
  p_new_name  text default null,
  p_new_city  text default null,
  p_new_state text default 'Karnataka'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cid   public.colleges.id%type;
  v_slug  text;
  v_base  text;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  perform 1 from public.profiles where id = p_user and role = 'coordinator';
  if not found then
    raise exception 'That account is not a coordinator.';
  end if;

  if p_college is not null and btrim(p_college) <> '' then
    select c.id into v_cid from public.colleges c where c.id::text = p_college;
    if not found then
      raise exception 'College not found.';
    end if;
  else
    if p_new_name is null or btrim(p_new_name) = '' then
      raise exception 'Choose a college or enter the new college name.';
    end if;

    v_base := trim(both '-' from regexp_replace(lower(btrim(p_new_name)), '[^a-z0-9]+', '-', 'g'));
    v_slug := v_base;
    if exists (select 1 from public.colleges where slug = v_slug) then
      v_slug := v_base || '-' || substr(md5(random()::text), 1, 5);
    end if;

    insert into public.colleges (name, slug, city, state, is_published)
    values (btrim(p_new_name), v_slug, coalesce(nullif(btrim(p_new_city), ''), 'Not specified'),
            coalesce(nullif(btrim(p_new_state), ''), 'Karnataka'), false)
    returning id into v_cid;
  end if;

  if exists (
    select 1 from public.profiles
     where college_id = v_cid and role = 'coordinator' and id <> p_user
  ) then
    raise exception 'This college already has a coordinator. Only one is allowed per college.'
      using errcode = '23505';
  end if;

  update public.profiles
     set college_id = v_cid, approval_status = 'approved'
   where id = p_user;
end $$;

create or replace function public.admin_reject_coordinator(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  update public.profiles
     set approval_status = 'rejected', college_id = null
   where id = p_user and role = 'coordinator';
end $$;

-- Approve / reject a coordinator's submitted change.
create or replace function public.admin_review_change(
  p_id      uuid,
  p_approve boolean,
  p_note    text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r        public.change_requests%rowtype;
  v_clause text;
  v_cols   text;
  v_pub    boolean;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  select * into r from public.change_requests where id = p_id for update;
  if not found then
    raise exception 'Change request not found.';
  end if;
  if r.status <> 'pending' then
    raise exception 'Only pending requests can be reviewed (this one is %).', r.status;
  end if;

  if p_approve then
    if r.entity = 'college' then
      -- Never let a payload touch these:
      v_clause := public._payload_set_clause(
        'colleges', r.payload,
        array['id', 'slug', 'is_published', 'created_at', 'updated_at']);

      if v_clause is not null then
        execute format(
          'update public.colleges t set %s, updated_at = now()
             from jsonb_populate_record(null::public.colleges, $1) r
            where t.id = $2', v_clause)
        using r.payload, r.college_id;
      end if;

    elsif r.entity = 'course' and r.action = 'create' then
      select c.is_published into v_pub from public.colleges c where c.id = r.college_id;

      v_cols := public._payload_columns(
        'courses', r.payload,
        array['id', 'college_id', 'is_published', 'created_at', 'updated_at']);

      execute format(
        'insert into public.courses (%1$s%2$scollege_id, is_published)
         select %1$s%2$s$2, $3
           from jsonb_populate_record(null::public.courses, $1) r',
        coalesce(v_cols, ''), case when v_cols is null then '' else ', ' end)
      using r.payload, r.college_id, coalesce(v_pub, false);

    elsif r.entity = 'course' and r.action = 'update' then
      v_clause := public._payload_set_clause(
        'courses', r.payload,
        array['id', 'college_id', 'is_published', 'created_at', 'updated_at']);

      if v_clause is not null then
        execute format(
          'update public.courses t set %s, updated_at = now()
             from jsonb_populate_record(null::public.courses, $1) r
            where t.id::text = $2 and t.college_id = $3', v_clause)
        using r.payload, r.entity_id, r.college_id;
      end if;

    elsif r.entity = 'course' and r.action = 'delete' then
      delete from public.courses
       where id::text = r.entity_id and college_id = r.college_id;
    end if;
  end if;

  update public.change_requests
     set status      = case when p_approve then 'approved' else 'rejected' end,
         admin_note  = nullif(btrim(coalesce(p_note, '')), ''),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_id;
end $$;

revoke all on function public.admin_approve_coordinator(uuid, text, text, text, text) from public, anon;
revoke all on function public.admin_reject_coordinator(uuid) from public, anon;
revoke all on function public.admin_review_change(uuid, boolean, text) from public, anon;
grant execute on function public.admin_approve_coordinator(uuid, text, text, text, text) to authenticated;
grant execute on function public.admin_reject_coordinator(uuid) to authenticated;
grant execute on function public.admin_review_change(uuid, boolean, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 7. Storage – college photos
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('college-photos', 'college-photos', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "college-photos read"   on storage.objects;
drop policy if exists "college-photos insert" on storage.objects;
drop policy if exists "college-photos update" on storage.objects;
drop policy if exists "college-photos delete" on storage.objects;

create policy "college-photos read" on storage.objects
  for select using (bucket_id = 'college-photos');

-- coordinators may only touch files inside their own college's folder: <college_id>/<file>
create policy "college-photos insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'college-photos'
    and ((storage.foldername(name))[1] = public.my_college_id() or public.is_admin()));

create policy "college-photos update" on storage.objects
  for update to authenticated
  using (bucket_id = 'college-photos'
    and ((storage.foldername(name))[1] = public.my_college_id() or public.is_admin()));

create policy "college-photos delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'college-photos'
    and ((storage.foldername(name))[1] = public.my_college_id() or public.is_admin()));


-- ----------------------------------------------------------------------------
-- 8. Row-Level Security  (replaces ALL existing policies on these tables)
-- ----------------------------------------------------------------------------

do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('profiles', 'colleges', 'courses', 'college_programs',
                         'student_requests', 'change_requests')
  loop
    execute format('drop policy if exists %I on %I.%I',
                   pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

alter table public.profiles         enable row level security;
alter table public.colleges         enable row level security;
alter table public.courses          enable row level security;
alter table public.college_programs enable row level security;
alter table public.student_requests enable row level security;
alter table public.change_requests  enable row level security;

-- profiles: you see/edit yourself (sensitive columns are locked by the trigger);
-- admins see and manage everyone.
create policy "profiles self read"  on public.profiles for select using (id = auth.uid());
create policy "profiles self update" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles admin all"  on public.profiles for all
  using (public.is_admin()) with check (public.is_admin());

-- colleges: students see published; a coordinator also sees their own; only admins write.
create policy "colleges read" on public.colleges for select
  using (is_published or public.is_admin() or id::text = public.my_college_id());
create policy "colleges admin write" on public.colleges for all
  using (public.is_admin()) with check (public.is_admin());

-- courses: same idea
create policy "courses read" on public.courses for select
  using (is_published or public.is_admin() or college_id::text = public.my_college_id());
create policy "courses admin write" on public.courses for all
  using (public.is_admin()) with check (public.is_admin());

-- college_programs (cutoffs): visible with their published college; admin writes
create policy "programs read" on public.college_programs for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.colleges c
       where c.id = college_programs.college_id
         and (c.is_published or c.id::text = public.my_college_id())
    )
  );
create policy "programs admin write" on public.college_programs for all
  using (public.is_admin()) with check (public.is_admin());

-- student enquiries: a coordinator handles only their own college's enquiries
create policy "requests insert" on public.student_requests for insert
  to authenticated with check (auth.uid() is not null);
create policy "requests coordinator read" on public.student_requests for select
  using (public.is_admin() or college_id::text = public.my_college_id());
create policy "requests coordinator update" on public.student_requests for update
  using (public.is_admin() or college_id::text = public.my_college_id())
  with check (public.is_admin() or college_id::text = public.my_college_id());
create policy "requests admin delete" on public.student_requests for delete
  using (public.is_admin());

-- change requests: coordinators can create/edit THEIR college's open requests
-- (draft/pending/rejected → draft/pending). They can never approve anything.
create policy "changes read" on public.change_requests for select
  using (public.is_admin() or college_id::text = public.my_college_id());
create policy "changes insert" on public.change_requests for insert
  to authenticated
  with check (
    college_id::text = public.my_college_id()
    and status in ('draft', 'pending')
  );
create policy "changes update" on public.change_requests for update
  to authenticated
  using (college_id::text = public.my_college_id()
         and status in ('draft', 'pending', 'rejected'))
  with check (college_id::text = public.my_college_id()
              and status in ('draft', 'pending'));
create policy "changes delete" on public.change_requests for delete
  to authenticated
  using (college_id::text = public.my_college_id()
         and status in ('draft', 'rejected'));
create policy "changes admin all" on public.change_requests for all
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.change_requests to authenticated;
