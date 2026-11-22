import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { gradeStudy, saveStudy, savePractice, requestPracticeFeedback } from "../../learning-actions";
import { AccountPrompt, Heading, SourceCard, Video } from "../../learning-ui";
import { admin, learner } from "../../../lib/learning/server";
import { SubmitButton } from "../../submit-button";
import { type WrittenFeedback } from "../../../lib/learning/ai";
import { type Lesson, type SavedResource } from "../../../lib/learning/model";

export default async function Study({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ attempt?: string; error?: string; saved?: string; feedbackError?: string }>;
}) {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const account = await learner();
  if (!account) return <AccountPrompt />;
  const db = admin();
  if (!db) return <p role="alert">Lesson storage needs server configuration.</p>;
  const query = await searchParams;
  const id = parsed.data;
  const result = await db.from("lessons").select("*").eq("id", id).eq("owner", account.owner).maybeSingle();
  if (result.error) throw new Error("Lesson unavailable");
  if (!result.data) notFound();
  const lesson = result.data as Lesson;
  const attemptId = z.uuid().safeParse(query.attempt);
  const [source, attempt, history, practice, feedback] = await Promise.all([
    lesson.resource_id ? account.client.from("resources").select("*").eq("id", lesson.resource_id).maybeSingle() : null,
    attemptId.success ? account.client.from("attempts").select("score,answers").eq("lesson_id", id).eq("submission", attemptId.data).maybeSingle() : null,
    account.client.from("attempts").select("id,score,created_at").eq("lesson_id", id).order("created_at", { ascending: false }).limit(10),
    account.client.from("practice_responses").select("response").eq("lesson_id", id).maybeSingle(),
    account.client.from("practice_feedback").select("id,body,created_at,response").eq("lesson_id", id).order("created_at", { ascending: false }).limit(10),
  ]);
  const names: Record<string, string> = { notes: "Notes must be under 12,001 characters.", save: "Study notes could not be saved.", grade: "Your assessment could not be recorded.", answers: "Choose an answer to every question." };
  return <article className="study">
    <Link className="text-link" href={lesson.resource_id ? "/university" : "/quick"}>← Back to learning</Link>
    <Heading title={lesson.body.title}>{lesson.minutes} min · AI-created lesson</Heading>
    <section><h2>Learning objectives</h2><ul>{lesson.body.objectives.map((item, i) => <li key={i}>{item}</li>)}</ul></section>
    {lesson.body.sections.map((section, i) => <section key={i}><h2>{section.title}</h2><p className="prose-text">{section.explanation}</p></section>)}
    <section id="practice"><h2>Practice assignment</h2><p className="prose-text">{lesson.body.exercise}</p>
      {(practice.error || query.error === "practice") && <p role="alert">The practice response could not be loaded or saved.</p>}
      {query.saved === "practice" && <p role="status">Practice response saved.</p>}
      {!practice.error && <form action={savePractice}>
        <input type="hidden" name="id" value={id} />
        <label>Your response<textarea name="response" rows={4} maxLength={12000} defaultValue={practice.data?.response} required /></label>
        <button className="button">Save response</button>
      </form>}
      {query.feedbackError && <p role="alert">{query.feedbackError}</p>}
      {feedback.error && <p role="alert">Previous feedback could not be loaded.</p>}
      {practice.data && <form action={requestPracticeFeedback}>
        <input type="hidden" name="id" value={id} />
        <p>Request feedback on the saved response. Your monthly AI limit applies.</p>
        <SubmitButton label="Assess saved response" pendingLabel="Preparing feedback…" />
      </form>}
      {feedback.data?.map((item, index) => {
        const report = item.body as WrittenFeedback;
        return <details key={item.id} open={index === 0}>
          <summary>AI feedback · {item.created_at.slice(0, 10)}{item.response !== practice.data?.response ? " · Earlier response" : ""}</summary>
          <p>Expected standard (3/4). State accurate claims, justify them, and apply them to the assignment.</p>
          <p>Accuracy {report.accuracy}/4 · Reasoning {report.reasoning}/4 · Application {report.application}/4</p>
          <p><strong>Strengths</strong> {report.strengths}</p><p><strong>Gaps</strong> {report.gaps}</p><p><strong>Next step</strong> {report.nextStep}</p>
        </details>;
      })}
    </section>
    {source?.data && <section>
      <h2>Aligned resource</h2><p>Alignment uses the publisher’s search metadata.</p>
      <SourceCard source={source.data as SavedResource}><Video source={source.data as SavedResource} /></SourceCard>
    </section>}
    {query.error && query.error !== "practice" && <p role="alert">{Object.hasOwn(names, query.error) ? names[query.error] : "The action failed."}</p>}
    <section id="check">
      <h2>Knowledge check</h2>
      {attempt?.data && <p role="status">Score {Math.round(Number(attempt.data.score) * 100)}%</p>}
      <form action={gradeStudy}>
        <input name="id" type="hidden" value={id} />
        <input name="submission" type="hidden" value={crypto.randomUUID()} />
        {lesson.body.questions.map((question, i) => <fieldset key={i}>
          <legend>{question.prompt}</legend>
          {question.options.map((option, j) => <label className="check" key={j}>
            <input type="radio" name={`answer-${i}`} value={j} required /> {option}
          </label>)}
          {attempt?.data && <p>{attempt.data.answers[i] === question.correct ? "Correct. " : "Review this question. "}{question.explanation}</p>}
        </fieldset>)}
        <button className="button">Submit answers</button>
      </form>
      {history.data?.length ? <details><summary>Assessment history</summary><ul>{history.data.map(row => <li key={row.id}>{row.created_at.slice(0, 10)} · {Math.round(Number(row.score) * 100)}%</li>)}</ul></details> : null}
    </section>
    <section><h2>Study notes</h2>
      {query.saved === "1" && <p role="status">Study notes saved.</p>}
      <form action={saveStudy}>
        <input type="hidden" name="id" value={id} />
        <label>Notes<textarea name="notes" maxLength={12000} defaultValue={lesson.notes} rows={5} /></label>
        <label className="check"><input name="bookmarked" type="checkbox" defaultChecked={lesson.bookmarked} /> Bookmark this lesson</label>
        <button className="button">Save notes</button>
      </form>
    </section>
  </article>;
}
