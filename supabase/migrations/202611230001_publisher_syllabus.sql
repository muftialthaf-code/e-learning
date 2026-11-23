begin;

alter table learning_engine.course_modules
  add column publisher_url text,
  add column publisher_title text,
  add constraint course_module_publisher_source check (
    (publisher_url is null and publisher_title is null) or
    (publisher_url is not null and publisher_title is not null
      and publisher_url like 'https://%'
      and char_length(publisher_title) between 2 and 120)
  );

revoke insert on learning_engine.course_modules from authenticated;
grant insert (owner, resource_id, title), update (title), delete
  on learning_engine.course_modules to authenticated;
grant insert on learning_engine.course_modules to service_role;
grant usage on sequence learning_engine.course_modules_position_seq to service_role;

create policy module_rename on learning_engine.course_modules for update to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy module_remove on learning_engine.course_modules for delete to authenticated
  using (owner = (select auth.uid()));

create table learning_engine.syllabus_previews (
  owner uuid not null,
  resource_id uuid not null,
  source_url text not null,
  titles jsonb not null check (jsonb_typeof(titles) = 'array' and jsonb_array_length(titles) <= 20),
  fetched_at timestamptz not null default now(),
  primary key (owner, resource_id),
  foreign key (owner,resource_id) references learning_engine.resources(owner,id) on delete cascade
);
alter table learning_engine.syllabus_previews enable row level security;
revoke all on learning_engine.syllabus_previews from anon, authenticated;
grant select on learning_engine.syllabus_previews to authenticated;
grant select, insert, update on learning_engine.syllabus_previews to service_role;
create policy own_syllabus_preview on learning_engine.syllabus_previews for select to authenticated
  using (owner = (select auth.uid()) and (select learning_engine.is_learning_member()));

commit;
