create schema learning_engine;
revoke all on schema learning_engine from public;
grant usage on schema learning_engine to authenticated, service_role;

create table learning_engine.allowed_learners (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table learning_engine.allowed_learners enable row level security;
revoke all on learning_engine.allowed_learners from anon, authenticated;
grant select on learning_engine.allowed_learners to authenticated, service_role;
create policy read_own_membership on learning_engine.allowed_learners
  for select to authenticated using (user_id = (select auth.uid()));

create function learning_engine.is_learning_member()
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from learning_engine.allowed_learners where user_id = (select auth.uid()))
$$;
revoke all on function learning_engine.is_learning_member() from public;
grant execute on function learning_engine.is_learning_member() to authenticated;

create table learning_engine.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  lesson_minutes integer not null default 10 check (lesson_minutes between 5 and 15)
);

alter table learning_engine.profiles enable row level security;
revoke all on learning_engine.profiles from anon, authenticated;
grant select, insert, update on learning_engine.profiles to authenticated;
create policy "Read own profile" on learning_engine.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "Insert own profile" on learning_engine.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy "Update own profile" on learning_engine.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
