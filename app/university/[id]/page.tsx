import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { learner } from "../../../lib/learning/server";
import { type SavedResource } from "../../../lib/learning/model";
import { addModule, importSyllabus } from "../../learning-actions";
import { AccountPrompt, Heading, SourceCard, Video } from "../../learning-ui";

export default async function Course({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const id = parsed.data;
  const account = await learner();
  if (!account) return <AccountPrompt />;
  const [source, modules, lessons, query] = await Promise.all([
    account.client.from("resources").select("*").eq("id", id).eq("approved", true).maybeSingle(),
    account.client.from("course_modules").select("id,title,lesson_id").eq("resource_id", id).order("position"),
    account.client.from("lessons").select("id,completed_at").eq("resource_id", id),
    searchParams,
  ]);
  if (source.error || modules.error || lessons.error) throw new Error("Study plan unavailable");
  if (!source.data) notFound();
  const resource = source.data as SavedResource;
  const completed = new Set(lessons.data?.filter(lesson => lesson.completed_at).map(lesson => lesson.id));
  const total = modules.data?.length ?? 0;
  const studied = modules.data?.filter(module => completed.has(module.lesson_id)).length ?? 0;
  return <article className="study">
    <Link className="text-link" href="/university">← Back to University</Link>
    <Heading title={resource.title}>Study plan · {studied} of {total} modules assessed</Heading>
    <SourceCard source={resource}><Video source={resource} /></SourceCard>
    <section><h2>Syllabus</h2>
      {total === 0 && <p>Add a module based on the source’s syllabus or your own learning goals.</p>}
      <ol className="records">{modules.data?.map(module => {
        const href = module.lesson_id ? `/study/${module.lesson_id}`
          : `/quick?${new URLSearchParams({ topic: module.title, resource: id, module: module.id })}`;
        return <li key={module.id}><Link href={href}>{module.title}</Link><small>{completed.has(module.lesson_id) ? "Assessed" : module.lesson_id ? "Ready to study" : "Plan a lesson"}</small></li>;
      })}</ol>
      {query.error && <p role="alert">The module could not be saved or linked. Check for a duplicate title and retry.</p>}
      <form action={addModule}>
        <input type="hidden" name="id" value={id} />
        <label>Module topic<input name="title" minLength={2} maxLength={120} required /></label>
        <button className="button">Add module</button>
      </form>
      <details><summary>Import syllabus titles</summary>
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
