# Database

Apply the migrations in filename order. The test suite applies them to embedded PostgreSQL with Supabase roles and a simulated authenticated identity.

| Area | Records and relationships |
| --- | --- |
| Profile | One `profiles` row per Supabase user. |
| Discovery | `resources` stores owner-scoped links, publisher, provenance and approval. URLs are unique per owner. |
| Courses and lessons | `course_modules` links an approved source and a saved lesson. `lessons` stores the generated body, reuse key, notes, bookmark and assessment date. `practice_responses` stores an independent written response. `practice_feedback` preserves the submitted text and rubric feedback for each assessed version. |
| Evidence | `attempts` stores answer choices and grades. `mastery` keeps the current estimate and due date per owner and normalized concept. Retrying the same assessment submission preserves the original score and review schedule. `course_exams` persists cumulative exam results and synchronizes module attempts in one transaction. |
| AI spending | `ai_budgets` sets the USD ceiling and `ai_usage` records estimates or settled costs. The reservation function serializes a learner’s budget checks. |
| Connector | Credentials, rate counters, audit records, external events and issued quizzes are server-only. The assessment trigger puts one event in `webhook_outbox` for each stored attempt. |

RLS limits browser-session access to owner rows. The authenticated role can read limited lesson columns and update notes and bookmarks. Server-only grading uses the answer key and owns writes to assessment evidence. The service role bypasses RLS, so application queries explicitly scope rows to the authenticated learner or connection.

## Supabase setup

1. Apply the SQL migrations in filename order in the project's SQL Editor. They create the `learning_engine` schema and leave existing application tables in `public`.
2. In the project's Data API settings, add `learning_engine` to the exposed schemas. Keep the project's current list, including `public` if already enabled.
3. In Authentication → Users, copy the User UID for the account that should be able to use AI Learning Engine. In SQL Editor run the following with that UUID.

   ```sql
   insert into learning_engine.allowed_learners (user_id)
   values ('YOUR-USER-UID'::uuid)
   on conflict do nothing;
   ```

4. Configure the app with the existing project URL and its publishable key plus the server-only service role key. Both apps use the same Supabase Auth user directory. Learning Engine uses its own allowlist, schema, and session cookie. The service role credential has project-wide access, so keep it in protected server environment settings only.

## Publisher syllabus upgrade

On an existing installation, apply only `202611230001_publisher_syllabus.sql`. It adds source attribution to imported modules, an owner-scoped cache of extracted titles, and permissions for changing or removing syllabus rows. Renaming retains the publisher's original title. Removing a module leaves any generated lesson and assessment history available.

The app sends the saved course URL to Firecrawl on an explicit publisher preview request. It stores the extracted titles for one day of reuse and saves only the titles the learner chooses.
