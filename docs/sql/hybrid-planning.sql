-- REVIEW ARTIFACT ONLY. Do not apply to production without explicit approval.
-- Uses existing Supabase Auth/RLS; no service-role key or changes to old tables.
create table public.studyroom_planning_plans (
  id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 196608),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.studyroom_planning_plans enable row level security;
revoke all on public.studyroom_planning_plans from anon;
grant select, insert, delete on public.studyroom_planning_plans to authenticated;
create policy own_plans_read on public.studyroom_planning_plans for select to authenticated using (user_id = (select auth.uid()));
create policy own_plans_insert on public.studyroom_planning_plans for insert to authenticated with check (user_id = (select auth.uid()));
create policy own_plans_delete on public.studyroom_planning_plans for delete to authenticated using (user_id = (select auth.uid()));
-- Serialize each account's inserts so concurrent requests cannot bypass the cap.
create function public.studyroom_limit_plans() returns trigger language plpgsql
set search_path = '' as $$
begin
  if auth.uid() is null or new.user_id <> auth.uid() then raise exception 'Owner mismatch'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 0));
  if (select count(*) from public.studyroom_planning_plans where user_id = new.user_id) >= 20 then
    raise exception 'Saved plan limit reached';
  end if;
  return new;
end;
$$;
create trigger studyroom_plan_limit before insert on public.studyroom_planning_plans for each row execute function public.studyroom_limit_plans();
