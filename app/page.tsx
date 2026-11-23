import Link from "next/link";
import { ArrowUpRight, BookOpen, Clock3, Zap } from "lucide-react";
import { learner } from "../lib/learning/server";
import { CourseBanner, type SuggestedCourse } from "./course-banner";

const featured: SuggestedCourse[] = [
  { title: "Introduction to Computer Science", publisher: "Harvard University · CS50x", description: "Learn to think algorithmically and build programs, from your first line of code to a final project.", href: "https://cs50.harvard.edu/x/" },
  { title: "Linear Algebra", publisher: "MIT OpenCourseWare", description: "Build an intuition for vectors, matrices, and the mathematics behind modern computing.", href: "https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/" },
  { title: "Financial Markets", publisher: "Yale University · Open Yale Courses", description: "Explore risk, behavioral finance, and the institutions that shape how markets work.", href: "https://oyc.yale.edu/economics/econ-252-11" },
];

export default async function Home() {
  const account = await learner();
  const [profileResult, active, reviews, progress, suggestions] = account ? await Promise.all([
    account.client.from("profiles").select("display_name,lesson_minutes,show_reminders,interests").eq("id", account.owner).maybeSingle(),
    account.client.from("lessons").select("id,topic,minutes").is("completed_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    account.client.from("mastery").select("concept,lesson_id", { count: "exact" }).lte("due_at", new Date().toISOString()).order("due_at").limit(1),
    account.client.from("lessons").select("id", { count: "exact", head: true }).not("completed_at", "is", null),
    account.client.from("resources").select("id,title,publisher").eq("approved", true).eq("kind", "course").order("checked_at", { ascending: false }).limit(2),
  ]) : [];
  const profile = profileResult?.data;
  const lesson = active?.data;
  const review = profile?.show_reminders === false ? null : reviews?.data?.[0];
  const interest = profile?.interests.split(",").map((item: string) => item.trim()).find((item: string) => item.length >= 2 && item.length <= 120);
  const saved = suggestions?.data?.map((source): SuggestedCourse => ({
    title: source.title, publisher: source.publisher, description: "Pick up a course you approved in your library.",
    href: `/university/${source.id}`, saved: true,
  })) ?? [];
  const courses = [...saved, ...featured.filter(course => !saved.some(source => source.title.toLowerCase() === course.title.toLowerCase()))].slice(0, 3);

  return <div className="home">
    <header className="home-heading">
      <div><h1>{profile ? `Welcome, ${profile.display_name}.` : "My Learning"}</h1><p>Choose what you’d like to learn next.</p></div>
      <Link className="glass discovery-link" href={interest ? `/discover?q=${encodeURIComponent(interest)}` : "/discover"}>Discover courses <ArrowUpRight size={16} aria-hidden="true" /></Link>
    </header>
    <CourseBanner courses={courses} />
    <section className="learning-section" aria-labelledby="learning-options">
      <h2 id="learning-options">Your learning</h2>
      <div className="learning-grid">
        <Link className="learning-card" href={lesson ? `/study/${lesson.id}` : "/quick"}>
          <span className="card-icon"><Zap size={20} aria-hidden="true" /></span><ArrowUpRight className="card-arrow" size={17} aria-hidden="true" />
          <h3>{lesson?.topic ?? "Quick Learning"}</h3>
          <p>{lesson ? `Continue your ${lesson.minutes}-minute lesson.` : `Explore a focused ${profile?.lesson_minutes ? `${profile.lesson_minutes}-minute` : "5–15 minute"} lesson.`}</p>
        </Link>
        <Link className="learning-card" href="/university">
          <span className="card-icon"><BookOpen size={20} aria-hidden="true" /></span><ArrowUpRight className="card-arrow" size={17} aria-hidden="true" />
          <h3>University</h3>
          <p>{progress?.count ? `${progress.count} ${progress.count === 1 ? "lesson" : "lessons"} assessed.` : "Open your courses and study plans."}</p>
        </Link>
        <Link className="learning-card" href={review ? `/study/${review.lesson_id}#check` : "/knowledge"}>
          <span className="card-icon"><Clock3 size={20} aria-hidden="true" /></span><ArrowUpRight className="card-arrow" size={17} aria-hidden="true" />
          <h3>Review queue</h3>
          <p>{review ? `${reviews?.count ?? 1} due · Next up: ${review.concept}` : "See your progress and upcoming reviews."}</p>
        </Link>
      </div>
    </section>
    {[profileResult, active, reviews, progress, suggestions].some(result => result?.error) && <p role="alert">Some learning records could not be loaded.</p>}
  </div>;
}
