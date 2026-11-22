import Link from "next/link";
import { learner } from "../../lib/learning/server";
import { type SavedResource } from "../../lib/learning/model";
import { approveResource, importResource } from "../learning-actions";
import { AccountPrompt, Heading, SourceCard } from "../learning-ui";

export default async function Library({ searchParams }: { searchParams: Promise<{ error?: string; q?: string }> }) {
  const account = await learner();
  const query = await searchParams;
  if (!account) return <><Heading title="Library">Keep the sources and lessons you want to revisit.</Heading><AccountPrompt /></>;
  const [resources, lessons] = await Promise.all([
    account.client.from("resources").select("*").order("checked_at", { ascending: false }),
    account.client.from("lessons").select("id,topic,notes").or("bookmarked.eq.true,notes.neq."),
  ]);
  const term = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const queryMatch = (text: string) => text.toLowerCase().includes(term.toLowerCase());
  const matches = (resources.data as SavedResource[] | null)?.filter(source => queryMatch(`${source.title} ${source.publisher} ${source.description}`));
  const savedLessons = lessons.data?.filter(lesson => queryMatch(`${lesson.topic} ${lesson.notes}`));
  return <>
    <Heading title="Library">Keep the sources and lessons you want to revisit.</Heading>
    <form className="search-form" action="/library">
      <label>Search saved material<input name="q" type="search" defaultValue={term} maxLength={100} /></label>
      <button className="button">Search</button>
    </form>
    {(query.error || resources.error || lessons.error) && <p role="alert">Some library changes or items could not be loaded.</p>}
    <section className="list-panel">
      <h2>Saved sources</h2>
      <details className="panel list-panel"><summary>Import a course link</summary>
        <form action={importResource}>
          <label>Course URL<input name="url" type="url" maxLength={2048} required /></label>
          <label>Title<input name="title" maxLength={300} required /></label>
          <label>Notes about the source<textarea name="description" maxLength={1600} rows={3} /></label>
          <button className="button">Save course link</button>
        </form>
      </details>
      {term && !matches?.length && <p>No saved sources match this search.</p>}
      {!term && !resources.data?.length && <p>Find material to save in <Link className="text-link" href="/discover">Discover</Link>.</p>}
      <div className="resource-grid">{matches?.map(source => <SourceCard key={source.id} source={source}>
        {source.approved ? <Link className="text-link" href={`/university/${source.id}`}>Open study plan →</Link>
          : <form action={approveResource}><input type="hidden" name="id" value={source.id} /><button className="button">Approve for study</button></form>}
      </SourceCard>)}</div>
    </section>
    <section className="panel list-panel"><h2>Bookmarks and notes</h2>
      {savedLessons?.length ? <ul className="records">{savedLessons.map(lesson => <li key={lesson.id}><Link href={`/study/${lesson.id}`}>{lesson.topic}</Link>{lesson.notes && <small>{lesson.notes.slice(0, 100)}</small>}</li>)}</ul> : <p>{term ? "No bookmarks or notes match this search." : "Bookmark a lesson or take notes while studying."}</p>}
    </section>
  </>;
}
