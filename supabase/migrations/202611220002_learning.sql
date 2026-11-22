alter table learning_engine.profiles
  add column difficulty text not null default 'intermediate' check (difficulty in ('introductory','intermediate','advanced')),
  add column revision_spacing_days integer not null default 3 check (revision_spacing_days between 1 and 14),
  add column show_reminders boolean not null default true,
  add column interests text not null default '' check (char_length(interests) <= 240);
grant select (id, revision_spacing_days) on learning_engine.profiles to service_role;

create table learning_engine.resources (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  url text not null,
  title text not null,
  publisher text not null,
  description text not null,
  kind text not null check (kind in ('course','video')),
  checked_at timestamptz not null,
  provenance text not null check (provenance in ('web_search','youtube','manual')),
  approved boolean not null default false,
  unique(owner,url),
  unique(owner,id)
);
create table learning_engine.lessons (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  input_key text not null,
  topic text not null,
  minutes integer not null check (minutes between 5 and 15),
  resource_id uuid,
  body jsonb not null,
  bookmarked boolean not null default false,
  notes text not null default '',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(owner,input_key),
  unique(owner,id),
  foreign key (owner,resource_id) references learning_engine.resources(owner,id)
);
create table learning_engine.attempts (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  lesson_id uuid not null,
  submission uuid not null,
  score numeric not null check (score between 0 and 1),
  answers jsonb not null,
  created_at timestamptz not null default now(),
  foreign key(owner,lesson_id) references learning_engine.lessons(owner,id),
  unique(owner,submission)
);
create table learning_engine.mastery (
  owner uuid not null references auth.users on delete cascade,
  concept text not null,
  lesson_id uuid not null,
  score numeric not null check (score between 0 and 1),
  attempts integer not null,
  due_at timestamptz not null,
  foreign key(owner,lesson_id) references learning_engine.lessons(owner,id),
  primary key(owner,concept)
);
create table learning_engine.ai_budgets (
  owner uuid primary key default auth.uid() references auth.users on delete cascade,
  monthly_micros bigint not null check (monthly_micros between 0 and 100000000)
);
create table learning_engine.ai_usage (
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  request_key text not null,
  amount bigint not null check (amount >= 0),
  model text,
  input_tokens integer,
  output_tokens integer,
  state text not null default 'reserved' check (state in ('reserved','settled')),
  created_at timestamptz not null default now(),
  primary key(owner,request_key)
);
do $$
declare relation text;
begin
  foreach relation in array array['resources','lessons','attempts','mastery','ai_budgets','ai_usage'] loop
    execute format('alter table learning_engine.%I enable row level security', relation);
    execute format('revoke all on learning_engine.%I from anon, authenticated', relation);
    execute format('grant select on learning_engine.%I to authenticated', relation);
    execute format('create policy owner_read on learning_engine.%I for select to authenticated using (owner = (select auth.uid()))', relation);
  end loop;
  foreach relation in array array['resources','lessons','ai_budgets'] loop
    execute format('grant insert, update on learning_engine.%I to authenticated', relation);
    execute format('create policy owner_insert on learning_engine.%I for insert to authenticated with check (owner = (select auth.uid()))', relation);
    execute format('create policy owner_update on learning_engine.%I for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()))', relation);
  end loop;
end $$;

create function learning_engine.reserve_learning_ai(p_owner uuid, p_key text, p_estimate bigint)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare cap bigint;
begin
  if p_estimate <= 0 then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text, 42));
  select monthly_micros into cap from learning_engine.ai_budgets where owner = p_owner;
  if cap is null or p_estimate + (select coalesce(sum(amount),0) from learning_engine.ai_usage
    where owner = p_owner and created_at >= date_trunc('month',now(),'UTC')) > cap then return false; end if;
  insert into learning_engine.ai_usage(owner,request_key,amount) values(p_owner,p_key,p_estimate)
    on conflict do nothing;
  return found;
end $$;
revoke all on function learning_engine.reserve_learning_ai(uuid,text,bigint) from public;
grant execute on function learning_engine.reserve_learning_ai(uuid,text,bigint) to service_role;

create function learning_engine.grade_learning_attempt(p_owner uuid, p_lesson uuid, p_submission uuid, p_answers jsonb)
returns numeric language plpgsql security invoker set search_path = '' as $$
declare
  questions jsonb;
  concept_key text;
  result numeric;
  existing learning_engine.attempts%rowtype;
  correct integer;
  count_questions integer;
  spacing integer;
begin
  select body->'questions', body->>'concept' into questions, concept_key
    from learning_engine.lessons where owner=p_owner and id=p_lesson for update;
  if not found then raise exception 'Lesson unavailable'; end if;
  count_questions := jsonb_array_length(questions);
  if count_questions is null or count_questions < 1 or jsonb_typeof(p_answers) <> 'array'
      or jsonb_array_length(p_answers) <> count_questions then raise exception 'Invalid answers'; end if;
  if exists (select 1 from jsonb_array_elements(p_answers) as answer where answer::text !~ '^[0-3]$')
      then raise exception 'Invalid choice'; end if;
  select count(*) into correct from jsonb_array_elements(questions) with ordinality q(item, n)
    where q.item->'correct' = p_answers->(q.n::integer-1);
  result := correct::numeric / count_questions;
  insert into learning_engine.attempts(owner,lesson_id,submission,score,answers)
    values(p_owner,p_lesson,p_submission,result,p_answers) on conflict do nothing;
  if not found then
    select * into existing from learning_engine.attempts where owner=p_owner and submission=p_submission;
    if existing.lesson_id <> p_lesson or existing.answers <> p_answers then raise exception 'Submission conflict'; end if;
    return existing.score;
  end if;
  select revision_spacing_days into spacing from learning_engine.profiles where id=p_owner;
  update learning_engine.lessons set completed_at=coalesce(completed_at,now()) where owner=p_owner and id=p_lesson;
  insert into learning_engine.mastery(owner,concept,lesson_id,score,attempts,due_at)
    values(p_owner,concept_key,p_lesson,result,1,now()+interval '1 day')
    on conflict(owner,concept) do update set
      lesson_id=excluded.lesson_id, score=learning_engine.mastery.score*0.35+result*0.65,
      attempts=learning_engine.mastery.attempts+1,
      due_at=now()+make_interval(days=>case when result>=0.8 then least(30,learning_engine.mastery.attempts*coalesce(spacing,3)) else 1 end);
  return result;
end $$;
revoke all on function learning_engine.grade_learning_attempt(uuid,uuid,uuid,jsonb) from public;
grant execute on function learning_engine.grade_learning_attempt(uuid,uuid,uuid,jsonb) to service_role;

revoke insert, update, select on learning_engine.lessons from authenticated;
grant select (id,owner,topic,minutes,resource_id,bookmarked,notes,completed_at,created_at)
  on learning_engine.lessons to authenticated;
grant update (notes,bookmarked) on learning_engine.lessons to authenticated;
grant select, insert, update, delete on learning_engine.resources, learning_engine.lessons, learning_engine.attempts,
  learning_engine.mastery, learning_engine.ai_budgets, learning_engine.ai_usage to service_role;
create index lessons_owner_created on learning_engine.lessons(owner,created_at desc);
create index attempts_owner_lesson on learning_engine.attempts(owner,lesson_id,created_at desc);
create index mastery_owner_due on learning_engine.mastery(owner,due_at);

create table learning_engine.course_modules (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  resource_id uuid not null,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  lesson_id uuid,
  position bigint generated always as identity,
  created_at timestamptz not null default now(),
  foreign key (owner,resource_id) references learning_engine.resources(owner,id) on delete cascade,
  foreign key (owner,lesson_id) references learning_engine.lessons(owner,id),
  unique(owner,resource_id,title)
);
alter table learning_engine.course_modules enable row level security;
revoke all on learning_engine.course_modules from anon, authenticated;
grant select, insert on learning_engine.course_modules to authenticated;
grant usage on sequence learning_engine.course_modules_position_seq to authenticated;
grant select, update on learning_engine.course_modules to service_role;
create policy module_read on learning_engine.course_modules for select to authenticated using (owner = (select auth.uid()));
create policy module_add on learning_engine.course_modules for insert to authenticated with check (
  owner = (select auth.uid()) and lesson_id is null
  and exists(select 1 from learning_engine.resources where id=resource_id and approved)
);

create table learning_engine.practice_responses (
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  lesson_id uuid not null,
  response text not null check (char_length(btrim(response)) between 1 and 12000),
  updated_at timestamptz not null default now(),
  primary key(owner,lesson_id),
  foreign key(owner,lesson_id) references learning_engine.lessons(owner,id) on delete cascade
);
alter table learning_engine.practice_responses enable row level security;
revoke all on learning_engine.practice_responses from anon,authenticated;
grant select,insert,update on learning_engine.practice_responses to authenticated;
create policy practice_owner on learning_engine.practice_responses for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

create table learning_engine.course_exams (
  owner uuid not null references auth.users on delete cascade,
  course_id uuid not null,
  submission uuid not null,
  answers jsonb not null,
  score numeric not null check (score between 0 and 1),
  created_at timestamptz not null default now(),
  primary key(owner,submission),
  foreign key(owner,course_id) references learning_engine.resources(owner,id) on delete cascade
);
alter table learning_engine.course_exams enable row level security;
revoke all on learning_engine.course_exams from anon,authenticated;
grant select (owner,course_id,submission,score,created_at) on learning_engine.course_exams to authenticated;
grant select,insert on learning_engine.course_exams to service_role;
create policy exams_owner on learning_engine.course_exams for select to authenticated using (owner = (select auth.uid()));

create function learning_engine.grade_course_exam(p_owner uuid,p_course uuid,p_submission uuid,p_answers jsonb)
returns numeric language plpgsql security invoker set search_path = '' as $$
declare
  previous learning_engine.course_exams%rowtype;
  module_record record;
  exam_score numeric := 0;
  module_count integer := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text || ':' || p_submission::text,51));
  select * into previous from learning_engine.course_exams where owner=p_owner and submission=p_submission;
  if found then
    if previous.course_id <> p_course or previous.answers <> p_answers then raise exception 'Submission conflict'; end if;
    return previous.score;
  end if;
  if jsonb_typeof(p_answers) <> 'object' or not exists (
    select 1 from learning_engine.resources where owner=p_owner and id=p_course and approved
  ) then raise exception 'Exam unavailable'; end if;
  for module_record in select id,lesson_id from learning_engine.course_modules
    where owner=p_owner and resource_id=p_course order by id limit 21
  loop
    module_count := module_count + 1;
    if module_record.lesson_id is null or not p_answers ? module_record.id::text or module_count > 20 then
      raise exception 'Exam syllabus changed or is incomplete';
    end if;
    exam_score := exam_score + learning_engine.grade_learning_attempt(p_owner,module_record.lesson_id,
      md5(p_submission::text || ':' || module_record.id::text)::uuid,p_answers->module_record.id::text);
  end loop;
  if module_count < 2 or module_count <> (select count(*) from jsonb_object_keys(p_answers)) then
    raise exception 'Exam syllabus changed or is incomplete';
  end if;
  exam_score := exam_score/module_count;
  insert into learning_engine.course_exams(owner,course_id,submission,answers,score)
    values(p_owner,p_course,p_submission,p_answers,exam_score);
  return exam_score;
end $$;
revoke all on function learning_engine.grade_course_exam(uuid,uuid,uuid,jsonb) from public;
grant execute on function learning_engine.grade_course_exam(uuid,uuid,uuid,jsonb) to service_role;

create table learning_engine.practice_feedback (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  lesson_id uuid not null,
  input_key text not null,
  response text not null,
  body jsonb not null,
  created_at timestamptz not null default now(),
  unique(owner,input_key),
  foreign key(owner,lesson_id) references learning_engine.lessons(owner,id) on delete cascade
);
alter table learning_engine.practice_feedback enable row level security;
revoke all on learning_engine.practice_feedback from anon,authenticated;
grant select on learning_engine.practice_feedback to authenticated;
grant select,insert on learning_engine.practice_feedback to service_role;
create policy feedback_owner on learning_engine.practice_feedback for select to authenticated using (owner=(select auth.uid()));
create index feedback_history on learning_engine.practice_feedback(owner,lesson_id,created_at desc);
