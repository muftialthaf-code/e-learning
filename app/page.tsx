import Link from "next/link";
import { learner } from "../lib/learning/server";

export default async function Home() {
  const account = await learner();
  const [profileResult, active, reviews, progress, suggestions] = account ? await Promise.all([
    account.client.from("profiles").select("display_name,lesson_minutes,show_reminders,interests").eq("id", account.owner).maybeSingle(),
    account.client.from("lessons").select("id,topic,minutes").is("completed_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    account.client.from("mastery").select("concept,lesson_id", { count: "exact" }).lte("due_at", new Date().toISOString()).order("due_at").limit(1),
    account.client.from("lessons").select("id", { count: "exact", head: true }).not("completed_at", "is", null),
    account.client.from("resources").select("id,title").eq("approved", true).order("checked_at", { ascending: false }).limit(3),
  ]) : [];
  const profile = profileResult?.data;
  const lesson = active?.data;
  const review = profile?.show_reminders === false ? null : reviews?.data?.[0];
  const interest = profile?.interests.split(",").map((item: string) => item.trim()).find((item: string) => item.length >= 2 && item.length <= 120);
  return <div className="home">
    <header className="page-header">
      <p className="eyebrow">My Learning</p>
      <h1>{profile ? `Welcome, ${profile.display_name}.` : "Your learning home."}</h1>
      <p>Make time for a short lesson or settle into a subject you want to study in depth.</p>
    </header>
    <section className="feature" aria-labelledby="next">
      <div>
        <p className="eyebrow">Quick Learning · {profile?.lesson_minutes ? `${profile.lesson_minutes} min` : "5–15 min"}</p>
        <h2 id="next">{lesson?.topic ?? "Learn one thing well."}</h2>
        <p>{lesson ? `Your ${lesson.minutes}-minute lesson is ready to study.` : "Focus on a single concept, work through an example, and check what you’ve understood."}</p>
        <Link className="button" href={lesson ? `/study/${lesson.id}` : "/quick"}>{lesson ? "Continue lesson" : "Explore Quick Learning"} <span aria-hidden="true">→</span></Link>
      </div>
      <div className="diagram" aria-hidden="true"><i /><i /><i /><b>✦</b></div>
    </section>
    <div className="lower">
      <section>
        <p className="eyebrow">University</p>
        <h2>Continue studying</h2>
        <p>{progress?.count ? `${progress.count} ${progress.count === 1 ? "lesson" : "lessons"} assessed across your learning profile.` : "Enrolled courses and your next lesson will appear here."}</p>
        <Link className="text-link" href="/university">View University →</Link>
      </section>
      <section>
        <p className="eyebrow">My Knowledge</p>
        <h2>Review queue</h2>
        <p>{review ? `${reviews?.count ?? 1} due · Next up: ${review.concept}` : "Your review queue will grow as you complete lessons and knowledge checks."}</p>
        {review && <p><Link className="text-link" href={`/study/${review.lesson_id}#check`}>Start review →</Link></p>}
        <Link className="text-link" href="/knowledge">View My Knowledge →</Link>
      </section>
    </div>
    <section className="panel list-panel">
      <h2>Find your next subject</h2>
      {suggestions?.data?.length ? <ul className="records">{suggestions.data.map(source => <li key={source.id}><Link href={`/university/${source.id}`}>{source.title}</Link></li>)}</ul>
        : <p>Look for a course or lecture to guide what you learn next.</p>}
      {interest
        ? <p><Link className="text-link" href={`/discover?q=${encodeURIComponent(interest)}`}>Explore {interest} →</Link> <small>From your saved interests</small></p>
        : <Link className="text-link" href="/discover">Browse Discover →</Link>}
    </section>
    {[profileResult, active, reviews, progress, suggestions].some(result => result?.error) && <p role="alert">Some learning records could not be loaded.</p>}
  </div>;
}
