-- =====================================================================
-- 005 – Link every course to its cutoff row(s)
-- Run this ONCE in the Supabase SQL editor (after 001-004).
--
--   * college_programs.course_id  -> the course this cutoff belongs to
--   * When a course is created (i.e. when the admin approves it), an EMPTY
--     cutoff row is created automatically for it (rank / exam / category /
--     year / round all empty). The coordinator then fills it in on the
--     "Cutoff Marks" page – that updates the SAME row.
--   * Renaming a course renames the branch on its cutoff rows.
--   * Deleting a course deletes its cutoff rows.
--   * Empty cutoff rows are hidden from students (they only see filled ones).
--   * Existing courses are back-filled (matched by name, else an empty row).
-- Safe to run more than once.
-- =====================================================================

-- 1. course_id column (same type as courses.id, whatever it is) ---------
do $$
declare
  v_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into v_type
    from pg_attribute a
   where a.attrelid = 'public.courses'::regclass
     and a.attname = 'id' and not a.attisdropped;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'college_programs'
       and column_name = 'course_id'
  ) then
    execute format(
      'alter table public.college_programs
         add column course_id %s references public.courses(id) on delete cascade',
      v_type);
  end if;
end $$;

create index if not exists college_programs_course_idx
  on public.college_programs (course_id);

-- 2. a placeholder row has no rank / exam / category yet ----------------
do $$
declare
  col text;
begin
  foreach col in array array['branch', 'exam', 'category', 'cutoff_rank'] loop
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'college_programs'
         and column_name = col and is_nullable = 'NO'
    ) then
      execute format('alter table public.college_programs alter column %I drop not null', col);
    end if;
  end loop;
end $$;

-- 3. new course -> empty cutoff row -------------------------------------
create or replace function public.course_create_cutoff_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.college_programs (college_id, course_id, branch)
  values (new.college_id, new.id, new.name);
  return new;
end;
$$;

drop trigger if exists course_create_cutoff_row on public.courses;
create trigger course_create_cutoff_row
  after insert on public.courses
  for each row execute function public.course_create_cutoff_row();

-- 4. renamed course -> renamed branch -----------------------------------
create or replace function public.course_sync_cutoff_branch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    update public.college_programs
       set branch = new.name
     where course_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists course_sync_cutoff_branch on public.courses;
create trigger course_sync_cutoff_branch
  after update of name on public.courses
  for each row execute function public.course_sync_cutoff_branch();

-- 5. back-fill existing courses -----------------------------------------
-- 5a. attach existing cutoffs whose branch equals the course name
update public.college_programs p
   set course_id = c.id
  from public.courses c
 where p.course_id is null
   and p.college_id = c.college_id
   and lower(trim(p.branch)) = lower(trim(c.name));

-- 5b. courses that still have no cutoff row get an empty one
insert into public.college_programs (college_id, course_id, branch)
select c.college_id, c.id, c.name
  from public.courses c
 where not exists (
   select 1 from public.college_programs p where p.course_id = c.id
 );

-- 6. students never see empty cutoff rows -------------------------------
drop policy if exists "programs read" on public.college_programs;
create policy "programs read" on public.college_programs for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.colleges c
       where c.id = college_programs.college_id
         and (
           c.id::text = public.my_college_id()
           or (c.is_published and college_programs.cutoff_rank is not null)
         )
    )
  );
