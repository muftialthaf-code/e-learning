import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { learner } from "../../../lib/learning/server";
import { type SavedResource } from "../../../lib/learning/model";
import { addModule, importSyllabus } from "../../learning-actions";
import { AccountPrompt, Heading, SourceCard, Video } from "../../learning-ui";
import { SubmitButton } from "../../submit-button";
import { syllabusTitles } from "../../../lib/learning/syllabus";
import { addPublisherModules, editModule, previewPublisherSyllabus, removeModule } from "./syllabus-actions";

const publisherMessages: Record<string, string> = {
  empty: "We couldn’t identify a syllabus in the public page content. You can still add your own topics below.",
  unavailable: "The publisher page could not be read. Try again later or add topics manually.",
  unsupported: "Publisher import requires a public course page. You can add topics manually for this source.",
  source: "The course source could not be loaded.",
  setup: "Publisher import requires Firecrawl and the server database connection.",
  storage: "The syllabus preview or selection could not be saved. Check that the publisher syllabus migration has been applied.",
  choose: "Select at least one available publisher module.",
  added: "Your selected publisher modules are in the syllabus.",
};
const moduleErrors: Record<string, string> = {
  rename: "The module could not be renamed.",
  duplicate: "A module with that title already exists.",
  remove: "The module could not be removed.",
  module: "The module could not be saved or linked. Check for a duplicate title and retry.",
};

export default async function Course({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; publisher?: string }> }) {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const id = parsed.data;
  const account = await learner();
  if (!account) return <AccountPrompt />;
  const [source, modules, lessons, query] = await Promise.all([
    account.client.from("resources").select("*").eq("id", id).eq("approved", true).maybeSingle(),
    account.client.from("course_modules").select("*").eq("resource_id", id).order("position"),
    account.client.from("lessons").select("id,completed_at").eq("resource_id", id),
    searchParams,
  ]);
  if (source.error || modules.error || lessons.error) throw new Error("Study plan unavailable");
  if (!source.data) notFound();
  const resource = source.data as SavedResource;
  const preview = query.publisher === "ready" || query.publisher === "choose"
    ? await account.client.from("syllabus_previews").select("titles").eq("resource_id", id)
      .eq("source_url", resource.url).maybeSingle() : null;
  const titles = syllabusTitles.safeParse(preview?.data?.titles);
  const existing = new Set(modules.data?.flatMap(module => [module.title, module.publisher_title].filter(Boolean)));
  const available = titles.success ? titles.data.filter(title => !existing.has(title)) : [];
  const publisherMessage = query.publisher && Object.hasOwn(publisherMessages, query.publisher) ? publisherMessages[query.publisher] : null;
  const error = query.error && Object.hasOwn(moduleErrors, query.error) ? moduleErrors[query.error] : null;
  const completed = new Set(lessons.data?.filter(lesson => lesson.completed_at).map(lesson => lesson.id));
  const total = modules.data?.length ?? 0;
  const studied = modules.data?.filter(module => completed.has(module.lesson_id)).length ?? 0;
  return <article className="study">
    <Link className="text-link" href="/university">← Back to University</Link>
    <Heading title={resource.title}>Study plan · {studied} of {total} modules assessed</Heading>
    <SourceCard source={resource}><Video source={resource} /></SourceCard>
    <section id="syllabus"><h2>Syllabus</h2>
      {resource.kind === "course" && <form action={previewPublisherSyllabus}>
        <input type="hidden" name="id" value={id} />
        <p>Preview module titles from the public course page. Fetching a new preview uses Firecrawl credits.</p>
        {query.publisher === "empty" && <input type="hidden" name="retryEmpty" value="yes" />}
        <SubmitButton label={query.publisher === "empty" ? "Check publisher page again" : "Import publisher syllabus"} pendingLabel="Reading publisher page…" />
      </form>}
      {publisherMessage && <p role={query.publisher === "added" || query.publisher === "empty" ? "status" : "alert"}>{publisherMessage}</p>}
      {preview?.error && <p role="alert">The publisher preview could not be loaded.</p>}
      {titles.success && (available.length ? <form action={addPublisherModules}>
        <input type="hidden" name="id" value={id} />
        <fieldset>
          <legend>Select publisher modules to add</legend>
          {available.map(title => <label key={title} className="check"><input type="checkbox" name="title" value={title} defaultChecked />{title}</label>)}
        </fieldset>
        <SubmitButton label="Add selected modules" pendingLabel="Adding modules…" />
      </form> : <p>These publisher modules are already in your study plan.</p>)}
      {total === 0 && <p>Add topics from the publisher’s syllabus or create your own modules.</p>}
      <ol className="records">{modules.data?.map(module => {
        const href = module.lesson_id ? `/study/${module.lesson_id}`
          : `/quick?${new URLSearchParams({ topic: module.title, resource: id, module: module.id })}`;
        return <li key={module.id}>
          <Link href={href}>{module.title}</Link>
          <small>{module.publisher_url ? <a href={module.publisher_url} target="_blank" rel="noreferrer">Publisher syllabus ↗</a> : "Custom module"}
            {module.publisher_title && module.publisher_title !== module.title && ` · Published as ${module.publisher_title}`}
            {" · "}{completed.has(module.lesson_id) ? "Assessed" : module.lesson_id ? "Ready to study" : "Plan a lesson"}
          </small>
          <details className="module-controls"><summary>Edit or remove</summary>
            <form action={editModule}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="module" value={module.id} />
              <label>Module title<input name="title" minLength={2} maxLength={120} required defaultValue={module.title} /></label>
              <button className="button">Save title</button>
            </form>
            <form action={removeModule}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="module" value={module.id} />
              {module.lesson_id && <small>Your saved lesson and assessment history will remain available.</small>}
              <button className="text-link">Remove from syllabus</button>
            </form>
          </details>
        </li>;
      })}</ol>
      {error && <p role="alert">{error}</p>}
      <form action={addModule}>
        <input type="hidden" name="id" value={id} />
        <label>Module topic<input name="title" minLength={2} maxLength={120} required /></label>
        <button className="button">Add module</button>
      </form>
      <details><summary>Paste custom module titles</summary>
        <form action={importSyllabus}>
          <input type="hidden" name="id" value={id} />
          <label>Up to 20 module titles, one per line<textarea name="syllabus" rows={5} maxLength={2600} required /></label>
          <button className="button">Add syllabus titles</button>
        </form>
      </details>
    </section>
    <section><h2>Course examination</h2><p>Review the whole syllabus with questions from each completed lesson plan.</p><Link className="text-link" href={`/university/${id}/exam`}>Open examination →</Link></section>
  </article>;
}
