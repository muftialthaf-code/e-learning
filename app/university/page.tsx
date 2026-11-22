import Link from "next/link";
import { learner } from "../../lib/learning/server";
import { type SavedResource } from "../../lib/learning/model";
import { AccountPrompt, Heading, SourceCard } from "../learning-ui";

export default async function University() {
  const account = await learner();
  const result = account ? await account.client.from("resources").select("*").eq("approved", true).order("title") : null;
  return <>
    <Heading title="University">Study approved sources through a syllabus of your own.</Heading>
    {!account ? <AccountPrompt /> : result?.error ? <p role="alert">Your study plans could not be loaded.</p>
      : result?.data?.length ? <div className="resource-grid">{(result.data as SavedResource[]).map(source =>
        <SourceCard key={source.id} source={source}><p><Link className="text-link" href={`/university/${source.id}`}>Open study plan →</Link></p></SourceCard>)}</div>
      : <section className="panel"><p>Approve a saved source to create its study plan.</p><Link className="text-link" href="/library">Open Library →</Link></section>}
  </>;
}
