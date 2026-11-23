import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const owner = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const submission = "20000000-0000-4000-8000-000000000001";

test("migrations enforce ownership, budgets, grading idempotency and webhook retries", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.profiles (name text);
      insert into public.profiles values ('Existing app');
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      grant usage on schema auth to authenticated;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable
        as $$ select current_setting('request.jwt.claim.sub', true)::uuid $$;
      insert into auth.users values ('${owner}'),('${other}');
    `);
    for (const name of ["202611220001_profiles", "202611220002_learning", "202611220003_companion", "202611230001_publisher_syllabus"]) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8"));
    }
    assert.deepEqual((await db.query("select name from public.profiles")).rows, [{ name: "Existing app" }]);
    await db.exec(`insert into learning_engine.allowed_learners values ('${owner}');
      set search_path to learning_engine, public;`);
    await db.exec(`
      set role authenticated;
      set request.jwt.claim.sub = '${owner}';
      insert into profiles values ('${owner}', 'Learner', 10);
      insert into ai_budgets(monthly_micros) values (100);
    `);
    await assert.rejects(db.exec(`insert into profiles values ('${other}', 'Other', 10)`), { code: "42501" });
    await assert.rejects(db.query("select body from lessons"), { code: "42501" });
    await assert.rejects(db.query("select * from companion_connections"), { code: "42501" });
    await assert.rejects(db.query("select reserve_learning_ai($1,'one',40)", [owner]), { code: "42501" });

    await db.exec("reset role; set role service_role");
    const reservation = async (key: string, amount: number) =>
      (await db.query("select reserve_learning_ai($1,$2,$3) as ok", [owner, key, amount])).rows;
    assert.deepEqual(await reservation("one", 40), [{ ok: true }]);
    assert.deepEqual(await reservation("one", 40), [{ ok: false }]);
    assert.deepEqual(await reservation("two", 61), [{ ok: false }]);
    assert.deepEqual(await reservation("two", 60), [{ ok: true }]);
    const { rows: [{ id }] } = await db.query<{ id: string }>(
      "insert into lessons(owner,input_key,topic,minutes,body) values ($1,'test','Algebra',10,$2) returning id",
      [owner, JSON.stringify({ concept: "algebra", questions: [{ correct: 1 }, { correct: 0 }] })],
    );
    const grade = (answers: number[]) => db.query("select grade_learning_attempt($1,$2,$3,$4) as score", [owner, id, submission, JSON.stringify(answers)]);
    await assert.rejects(grade([1]), /Invalid answers/);
    assert.deepEqual((await grade([1, 0])).rows, [{ score: "1.00000000000000000000" }]);
    assert.deepEqual((await grade([1, 0])).rows, [{ score: "1.00000000000000000000" }]);
    await assert.rejects(grade([0, 1]), /Submission conflict/);
    assert.deepEqual((await db.query("select concept,attempts,due_at>now() as scheduled from mastery")).rows, [{ concept: "algebra", attempts: 1, scheduled: true }]);
    assert.equal((await db.query("select * from claim_learning_webhooks($1)", [owner])).rows.length, 1);
    assert.equal((await db.query("select * from claim_learning_webhooks($1)", [owner])).rows.length, 0);
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${owner}'`);
    const { rows: [{ id: course }] } = await db.query<{ id: string }>(
      "insert into resources(url,title,publisher,description,kind,provenance,checked_at) values ('https://example.org/course','Linear algebra','Example','Course','course','manual',now()) returning id",
    );
    await assert.rejects(db.query("insert into course_modules(resource_id,title) values ($1,'Vectors')", [course]), { code: "42501" });
    await db.query("update resources set approved=true where id=$1", [course]);
    const { rows: modules } = await db.query<{ id: string }>(
      "insert into course_modules(resource_id,title) values ($1,'Vectors'),($1,'Linear maps') returning id", [course],
    );
    await db.exec("reset role; set role service_role");
    await db.query("update course_modules set lesson_id=$1 where resource_id=$2", [id, course]);
    await db.query("insert into syllabus_previews(owner,resource_id,source_url,titles) values ($1,$2,'https://example.org/course',$3)", [owner, course, JSON.stringify(["Lesson 3: Basis"])]);
    const published = await db.query<{ id: string }>(
      "insert into course_modules(owner,resource_id,title,publisher_url,publisher_title) values ($1,$2,'Lesson 3: Basis','https://example.org/course','Lesson 3: Basis') returning id",
      [owner, course],
    );
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${owner}'`);
    assert.equal((await db.query("select titles from syllabus_previews")).rows.length, 1);
    await assert.rejects(db.query("update course_modules set publisher_title='Faked title'"), { code: "42501" });
    await assert.rejects(db.query("insert into course_modules(resource_id,title,publisher_title) values ($1,'Fake module','Fake')", [course]), { code: "42501" });
    await db.query("update course_modules set title='Basis and dimension' where id=$1", [published.rows[0].id]);
    assert.deepEqual((await db.query("select title, publisher_title from course_modules where id=$1", [published.rows[0].id])).rows,
      [{ title: "Basis and dimension", publisher_title: "Lesson 3: Basis" }]);
    await db.query("delete from course_modules where id=$1", [published.rows[0].id]);
    await db.exec("reset role; set role service_role");
    const examId = "20000000-0000-4000-8000-000000000002";
    const gradeExam = (answers: Record<string, number[]>) =>
      db.query<{ score: string }>("select grade_course_exam($1,$2,$3,$4) as score", [owner, course, examId, JSON.stringify(answers)]);
    await assert.rejects(gradeExam({ [modules[0].id]: [1, 0] }), /Exam syllabus changed/);
    const exam = { [modules[0].id]: [1, 0], [modules[1].id]: [1, 1] };
    assert.equal(Number((await gradeExam(exam)).rows[0].score), 0.75);
    assert.equal(Number((await gradeExam(exam)).rows[0].score), 0.75);
    assert.equal((await db.query("select id from attempts")).rows.length, 3);
    await db.query("insert into practice_feedback(owner,lesson_id,input_key,response,body) values ($1,$2,'fixture','Example response','{}')", [owner, id]);
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${owner}'`);
    assert.equal((await db.query("select id from practice_feedback")).rows.length, 1);
    await assert.rejects(db.query("update practice_feedback set body='{}'"), { code: "42501" });
    await db.exec("reset role; set role service_role");
    const { rows: [{ id: connection }] } = await db.query<{ id: string }>(
      "insert into companion_connections(owner,label,digest,scopes,expires_at) values ($1,'Test','digest','{}',now()+interval '1 day') returning id",
      [owner],
    );
    await db.exec("begin");
    for (let i = 1; i <= 62; i++) {
      assert.deepEqual((await db.query("select count_companion_call($1) as count", [connection])).rows, [{ count: Math.min(i, 61) }]);
    }
    await db.exec(`commit; reset role; set role authenticated; set request.jwt.claim.sub = '${other}'`);
    assert.deepEqual((await db.query("select is_learning_member() as allowed")).rows, [{ allowed: false }]);
    await assert.rejects(db.exec(`insert into profiles values ('${other}', 'Other', 10)`), { code: "42501" });
    assert.deepEqual((await db.query("select id,topic from lessons")).rows, []);
    assert.deepEqual((await db.query("select * from mastery")).rows, []);
    assert.deepEqual((await db.query("select * from practice_feedback")).rows, []);
    await db.exec(`reset role; insert into allowed_learners values ('${other}'); set role authenticated`);
    assert.deepEqual((await db.query("select * from syllabus_previews")).rows, []);
    assert.equal((await db.query("delete from course_modules where resource_id=$1 returning id", [course])).rows.length, 0);
    await db.exec(`set request.jwt.claim.sub = '${owner}'`);
    await db.query("delete from course_modules where id=$1", [modules[0].id]);
    assert.equal((await db.query("select id from lessons where id=$1", [id])).rows.length, 1);
  } finally {
    await db.close();
  }
});
