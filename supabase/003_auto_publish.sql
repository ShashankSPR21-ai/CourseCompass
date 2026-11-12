-- ============================================================================
-- CourseCompass – coordinator edits go LIVE for students immediately
--
-- Run AFTER 001 and 002.  Supabase → SQL Editor → paste → Run.  Safe to re-run.
--
-- What it does
--   • Coordinator edits (college details, photos/logo/cover, courses, cutoffs)
--     are applied to the live tables the moment the coordinator submits them
--     and the request is stored as "approved" (history is kept).
--   • An admin can switch this OFF/ON any time (Admin → Change Requests → toggle,
--     or run the 2 statements at the bottom). OFF = old behaviour: admin approves first.
--   • Anything already waiting for approval is published when you run this.
--   • If applying a change fails, the request stays "pending" with the error in
--     the admin note, so nothing is lost.
-- ============================================================================

-- 1. settings ----------------------------------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "settings read"        on public.app_settings;
drop policy if exists "settings admin write" on public.app_settings;

create policy "settings read" on public.app_settings
  for select to authenticated using (true);
create policy "settings admin write" on public.app_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update on public.app_settings to authenticated;

insert into public.app_settings (key, value)
values ('coordinator_auto_publish', 'on')
on conflict (key) do nothing;

create or replace function public._auto_publish_on()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select value = 'on' from public.app_settings
                    where key = 'coordinator_auto_publish'), false);
$$;

-- 2. the apply logic (shared by admin approval and auto publish) --------------
create or replace function public._apply_change(p_id uuid)
returns void
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
  select * into r from public.change_requests where id = p_id;
  if not found then
    raise exception 'Change request not found.';
  end if;

  if r.entity = 'college' then
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

  elsif r.entity = 'program' and r.action = 'create' then
    v_cols := public._payload_columns(
      'college_programs', r.payload,
      array['id', 'college_id', 'created_at', 'updated_at']);

    execute format(
      'insert into public.college_programs (%1$s%2$scollege_id)
       select %1$s%2$s$2
         from jsonb_populate_record(null::public.college_programs, $1) r',
      coalesce(v_cols, ''), case when v_cols is null then '' else ', ' end)
    using r.payload, r.college_id;

  elsif r.entity = 'program' and r.action = 'update' then
    v_clause := public._payload_set_clause(
      'college_programs', r.payload,
      array['id', 'college_id', 'created_at', 'updated_at']);

    if v_clause is not null then
      execute format(
        'update public.college_programs t set %s
           from jsonb_populate_record(null::public.college_programs, $1) r
          where t.id::text = $2 and t.college_id = $3', v_clause)
      using r.payload, r.entity_id, r.college_id;
    end if;

  elsif r.entity = 'program' and r.action = 'delete' then
    delete from public.college_programs
     where id::text = r.entity_id and college_id = r.college_id;
  end if;
end $$;

-- internal only: nobody can call it through the API
revoke all on function public._apply_change(uuid) from public, anon, authenticated;

-- 3. admin review now reuses it ----------------------------------------------
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
  r public.change_requests%rowtype;
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
    perform public._apply_change(p_id);
  end if;

  update public.change_requests
     set status      = case when p_approve then 'approved' else 'rejected' end,
         admin_note  = nullif(btrim(coalesce(p_note, '')), ''),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_id;
end $$;

revoke all on function public.admin_review_change(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_change(uuid, boolean, text) to authenticated;

-- 4. let the trigger below update review fields -------------------------------
create or replace function public.change_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();

  -- set only inside change_requests_auto_apply() (transaction-local)
  if current_setting('app.bypass_guard', true) = 'on' then
    return new;
  end if;

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
    new.admin_note   := null;
  end if;

  return new;
end $$;

-- 5. auto publish -------------------------------------------------------------
create or replace function public.change_requests_auto_apply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending'
     and (tg_op = 'INSERT' or old.status is distinct from 'pending')
     and public._auto_publish_on() then

    begin
      perform public._apply_change(new.id);

      perform set_config('app.bypass_guard', 'on', true);
      update public.change_requests
         set status = 'approved',
             admin_note = 'Published automatically',
             reviewed_at = now()
       where id = new.id;
      perform set_config('app.bypass_guard', 'off', true);
    exception when others then
      perform set_config('app.bypass_guard', 'on', true);
      update public.change_requests
         set admin_note = left('Auto-publish failed – needs admin review: ' || sqlerrm, 500)
       where id = new.id;
      perform set_config('app.bypass_guard', 'off', true);
    end;
  end if;

  return null;
end $$;

drop trigger if exists change_requests_auto_apply on public.change_requests;
create trigger change_requests_auto_apply
  after insert or update of status on public.change_requests
  for each row execute function public.change_requests_auto_apply();

-- 6. publish everything that is waiting right now ----------------------------
do $$
declare r record;
begin
  if public._auto_publish_on() then
    for r in select id from public.change_requests
              where status = 'pending' order by submitted_at nulls last, created_at
    loop
      begin
        perform public._apply_change(r.id);
        perform set_config('app.bypass_guard', 'on', true);
        update public.change_requests
           set status = 'approved', admin_note = 'Published automatically', reviewed_at = now()
         where id = r.id;
        perform set_config('app.bypass_guard', 'off', true);
      exception when others then
        raise notice 'Could not publish change %: %', r.id, sqlerrm;
      end;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Switch modes any time:
--   update public.app_settings set value = 'off' where key = 'coordinator_auto_publish'; -- admin approves first
--   update public.app_settings set value = 'on'  where key = 'coordinator_auto_publish'; -- instant publishing
-- ---------------------------------------------------------------------------

-- make the API see the new table immediately
notify pgrst, 'reload schema';
