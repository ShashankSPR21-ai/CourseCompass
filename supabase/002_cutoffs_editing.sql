-- ============================================================================
-- CourseCompass – coordinators can edit CUTOFF marks/ranks (through admin approval)
--
-- Run AFTER 001_coordinator_workflow.sql:
--   Supabase Dashboard → SQL Editor → paste → Run.   Safe to run more than once.
--
-- What it does
--   1. change_requests.entity may now also be 'program' (one cutoff row of
--      public.college_programs: branch + exam + category + cutoff rank/year/round)
--   2. admin_review_change() knows how to apply program create / update / delete
--   Coordinators still NEVER write to college_programs directly – the admin
--   approves first, exactly like college details and courses.
-- ============================================================================

-- 1. allow the new entity ----------------------------------------------------
alter table public.change_requests
  drop constraint if exists change_requests_entity_check;

alter table public.change_requests
  add constraint change_requests_entity_check
  check (entity in ('college', 'course', 'program'));

create unique index if not exists change_requests_one_open_program
  on public.change_requests (college_id, entity_id)
  where entity = 'program' and entity_id is not null
    and status in ('draft', 'pending', 'rejected');

-- 2. admin review handles programs -------------------------------------------
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

    -- ---- cutoffs (college_programs) -----------------------------------
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
