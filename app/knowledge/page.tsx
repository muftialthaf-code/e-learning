import Link from "next/link";
import { learner } from "../../lib/learning/server";
import { AccountPrompt, Heading } from "../learning-ui";

export default async function Knowledge() {
  const account = await learner();
  const [concepts, attempts] = account ? await Promise.all([
    account.client.from("mastery").select("concept,lesson_id,score,attempts,due_at").order("due_at").limit(100),
    account.client.from("attempts").select("id,lesson_id,score,created_at").order("created_at", { ascending: false }).limit(15),
  ]) : [];
  const links = account && concepts?.data?.length
    ? await account.client.from("lessons").select("id,resource_id").in("id", concepts.data.map(concept => concept.lesson_id))
    : null;
  const courseByLesson = new Map(links?.data?.map(lesson => [lesson.id, lesson.resource_id]));
  const relatedConcepts = (lessonId: string, conceptKey: string) => {
    const course = courseByLesson.get(lessonId);
    return course ? concepts?.data?.filter(item => item.concept !== conceptKey
      && courseByLesson.get(item.lesson_id) === course).slice(0, 3) : null;
  };
  const now = new Date().getTime();
  const needsPractice = concepts?.data?.filter(concept => Number(concept.score) < 0.6).slice(0, 5);
  return <>
    <Heading title="My Knowledge">See the concepts you’re building and when to recall them again.</Heading>
    {!account ? <AccountPrompt /> : <>
      {(concepts?.error || attempts?.error || links?.error) && <p role="alert">Some knowledge records could not be loaded.</p>}
      <section className="panel"><h2>Concepts and revision</h2>
        {concepts?.data?.length ? <ul className="records">{concepts.data.map(concept => {
          const related = relatedConcepts(concept.lesson_id, concept.concept);
          return <li key={concept.concept}>
          <Link href={`/study/${concept.lesson_id}#check`}>{concept.concept}</Link>
          <small>{Math.round(Number(concept.score) * 100)}% estimated mastery · {concept.attempts} checks · {new Date(concept.due_at).getTime() <= now ? "Due now" : `Review ${concept.due_at.slice(0, 10)}`}</small>
          {!!related?.length && <small>From the same source · {related.map((item, i) =>
            <span key={item.concept}>{i > 0 && ", "}<Link href={`/study/${item.lesson_id}#check`}>{item.concept}</Link></span>)}</small>}
        </li>;
        })}</ul> : <p>Complete a knowledge check to schedule your first review.</p>}
      </section>
      {!!needsPractice?.length && <section className="panel list-panel"><h2>Concepts to strengthen</h2>
        <p>These concepts have an estimated mastery below 60%.</p>
        <ul className="records">{needsPractice.map(concept => <li key={concept.concept}><Link href={`/study/${concept.lesson_id}#check`}>{concept.concept}</Link></li>)}</ul>
      </section>}
      <section className="panel list-panel"><h2>Recent assessment history</h2>
        {attempts?.data?.length ? <ul className="records">{attempts.data.map(row => <li key={row.id}><Link href={`/study/${row.lesson_id}`}>Assessment · {row.created_at.slice(0, 10)}</Link><small>{Math.round(Number(row.score) * 100)}%</small></li>)}</ul> : <p>Your assessment history is empty.</p>}
      </section>
    </>}
  </>;
}
