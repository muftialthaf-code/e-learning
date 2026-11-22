create table learning_engine.companion_connections (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  label text not null,
  digest text not null unique,
  scopes text[] not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create table learning_engine.companion_calls (
  connection_id uuid not null references learning_engine.companion_connections on delete cascade,
  minute timestamptz not null,
  count integer not null default 1,
  primary key(connection_id,minute)
);
create table learning_engine.companion_audit (
  id bigint generated always as identity primary key,
  connection_id uuid not null references learning_engine.companion_connections on delete cascade,
  operation text not null,
  status integer not null,
  happened_at timestamptz not null default now()
);
create table learning_engine.companion_events (
  connection_id uuid not null references learning_engine.companion_connections on delete cascade,
  event_id uuid not null,
  operation text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key(connection_id,event_id)
);
create table learning_engine.companion_quizzes (
  connection_id uuid not null references learning_engine.companion_connections on delete cascade,
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references learning_engine.lessons on delete cascade,
  expires_at timestamptz not null default (now()+interval '1 hour')
);
create table learning_engine.webhook_outbox (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  event_type text not null,
  payload jsonb not null,
  tries integer not null default 0,
  available_at timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index webhook_outbox_pending on learning_engine.webhook_outbox(owner,available_at)
  where delivered_at is null and tries < 5;

do $$
declare relation text;
begin
  foreach relation in array array['companion_connections','companion_calls','companion_audit','companion_events','companion_quizzes','webhook_outbox'] loop
    execute format('alter table learning_engine.%I enable row level security', relation);
    execute format('revoke all on learning_engine.%I from anon,authenticated', relation);
    execute format('grant select,insert,update,delete on learning_engine.%I to service_role', relation);
  end loop;
end $$;
grant usage, select on sequence learning_engine.companion_audit_id_seq to service_role;

create function learning_engine.count_companion_call(p_connection uuid)
returns integer language sql security invoker set search_path = '' as $$
  insert into learning_engine.companion_calls(connection_id,minute) values(p_connection,date_trunc('minute',now()))
  on conflict(connection_id,minute) do update set count=least(learning_engine.companion_calls.count+1,61)
  returning count
$$;
revoke all on function learning_engine.count_companion_call(uuid) from public;
grant execute on function learning_engine.count_companion_call(uuid) to service_role;

create function learning_engine.enqueue_learning_attempt()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  insert into learning_engine.webhook_outbox(owner,event_type,payload)
    values(new.owner,'assessment.recorded',jsonb_build_object('assessmentId',new.id,'lessonId',new.lesson_id,'score',new.score));
  return new;
end $$;
create trigger learning_attempt_webhook after insert on learning_engine.attempts
  for each row execute function learning_engine.enqueue_learning_attempt();

create function learning_engine.claim_learning_webhooks(p_owner uuid)
returns setof learning_engine.webhook_outbox language sql security invoker set search_path = '' as $$
  update learning_engine.webhook_outbox set
    tries=tries+1, available_at=now()+make_interval(mins=>5 * (1 << tries))
    where id in (
      select id from learning_engine.webhook_outbox
      where owner=p_owner and delivered_at is null and tries < 5 and available_at <= now()
      order by available_at limit 10 for update skip locked
    )
    returning *
$$;
revoke all on function learning_engine.claim_learning_webhooks(uuid) from public;
grant execute on function learning_engine.claim_learning_webhooks(uuid) to service_role;

-- Existing project users need explicit permission in addition to ownership.
do $$
declare relation text;
begin
  foreach relation in array array[
    'profiles','resources','lessons','attempts','mastery','ai_budgets','ai_usage',
    'course_modules','practice_responses','course_exams','practice_feedback'
  ] loop
    execute format('create policy learning_member on learning_engine.%I as restrictive for all to authenticated using ((select learning_engine.is_learning_member())) with check ((select learning_engine.is_learning_member()))', relation);
  end loop;
end $$;
