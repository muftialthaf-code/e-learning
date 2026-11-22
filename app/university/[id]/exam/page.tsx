import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { learner, admin } from "../../../../lib/learning/server";
import { type Lesson } from "../../../../lib/learning/model";
import { submitExam } from "../../../learning-actions";
import { AccountPrompt, Heading } from "../../../learning-ui";

export default async function Exam({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; attempt?: string }>;
}) {
  const courseId = z.uuid().safeParse((await params).id);
  if (!courseId.success) notFound();
  const id = courseId.data;
  const account = await learner();
  if (!account) return <AccountPrompt />;
  const db = admin();
  if (!db) return <p role="alert">Exams need server configuration.</p>;
  const [course, modules, history, query] = await Promise.all([
    account.client.from("resources").select("title").eq("id", id).eq("approved", true).maybeSingle(),
    account.client.from("course_modules").select("id,title,lesson_id").eq("resource_id", id).order("position").limit(21),
    account.client.from("course_exams").select("submission,score,created_at").eq("course_id", id).order("created_at", { ascending: false }).limit(20),
    searchParams,
  ]);
  if (course.error || modules.error || history.error) throw new Error("Examination unavailable");
  if (!course.data) notFound();
  const ids = modules.data.map(module => module.lesson_id).filter(Boolean);
  const eligible = modules.data.length >= 2 && modules.data.length <= 20 && ids.length === modules.data.length;
  const lessons = eligible ? await db.from("lessons").select("id,body").eq("owner", account.owner).in("id", ids) : null;
  const questions = new Map(lessons?.data?.map(row => [row.id, (row.body as Lesson["body"]).questions]));
  const current = history.data.find(row => row.submission === query.attempt);
  const available = eligible && ids.every(lessonId => questions.has(lessonId));
  return <article className="study">
    <Link className="text-link" href={`/university/${id}`}>← Back to syllabus</Link>
    <Heading title="Course examination">{course.data.title} · Comprehensive knowledge check</Heading>
    {query.error && <p role="alert">The exam could not be recorded. Check every answer and confirm the current syllabus.</p>}
    {lessons?.error && <p role="alert">Exam questions could not be loaded.</p>}
    {current && <p role="status">Exam score {Math.round(Number(current.score) * 100)}%</p>}
    {available ? <form action={submitExam}>
      <input name="id" type="hidden" value={id} />
      <input name="submission" type="hidden" value={crypto.randomUUID()} />
      {modules.data.map(module => <section key={module.id}><h2>{module.title}</h2>
        {questions.get(module.lesson_id)?.map((question, i) => <fieldset key={i}>
          <legend>{question.prompt}</legend>
          {question.options.map((option, j) => <label key={j} className="check"><input name={`answer-${module.id}-${i}`} type="radio" value={j} required />{option}</label>)}
        </fieldset>)}
      </section>)}
      <button className="button">Submit exam</button>
    </form> : <p>Generate lessons for all modules in a syllabus of 2–20 modules to open the exam.</p>}
    {history.data.length > 0 && <section><h2>Exam history</h2><ul>
      {history.data.map(row => <li key={row.submission}>{row.created_at.slice(0, 10)} · {Math.round(Number(row.score) * 100)}%</li>)}
    </ul></section>}
  </article>;
}
