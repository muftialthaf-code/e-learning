import Link from "next/link";
import { learner } from "../../lib/learning/server";
import { createLesson } from "../learning-actions";
import { AccountPrompt, Heading } from "../learning-ui";
import { SubmitButton } from "../submit-button";

export default async function Quick({ searchParams }: { searchParams: Promise<{ error?: string; topic?: string; resource?: string; module?: string }> }) {
  const query = await searchParams;
  const account = await learner();
  const [history, sources, profile] = account ? await Promise.all([
    account.client.from("lessons").select("id,topic,minutes,completed_at").order("created_at", { ascending: false }).limit(20),
    account.client.from("resources").select("id,title").order("title"),
    account.client.from("profiles").select("lesson_minutes").eq("id", account.owner).maybeSingle(),
  ]) : [];
  return <>
    <Heading title="Quick Learning">A worked example, a practical exercise, and a knowledge check in 5–15 minutes.</Heading>
    {!account ? <><AccountPrompt /><p><Link className="text-link" href="/sandbox">Try a sample lesson →</Link></p></> : <>
      <section className="panel">
        {query.error && <p role="alert">{query.error}</p>}
        <form action={createLesson}>
          <label>What do you want to learn?<input name="topic" required minLength={2} maxLength={120} defaultValue={query.topic} /></label>
          <label>Minutes<input name="minutes" type="number" required min={5} max={15} defaultValue={profile?.data?.lesson_minutes ?? 10} /></label>
          <label>Align with a saved source<select name="resource" defaultValue={query.resource ?? ""}><option value="">No source selected</option>
            {sources?.data?.map(source => <option key={source.id} value={source.id}>{source.title}</option>)}
          </select></label>
          {query.module && <input type="hidden" name="module" value={query.module} />}
          <SubmitButton label="Generate lesson" pendingLabel="Preparing lesson…" />
        </form>
      </section>
      <section className="panel list-panel"><h2>Recent lessons</h2>
        {history?.error ? <p role="alert">Recent lessons could not be loaded.</p>
          : history?.data?.length ? <ul className="records">{history.data.map(row => <li key={row.id}><Link href={`/study/${row.id}`}>{row.topic}</Link><small>{row.minutes} min · {row.completed_at ? "Assessed" : "Ready to study"}</small></li>)}</ul>
          : <p>Your generated lessons will appear here.</p>}
      </section>
    </>}
  </>;
}
