import { discover, discoveryConfigured } from "../../lib/learning/discovery";
import { relevance, topicSchema } from "../../lib/learning/model";
import { learner } from "../../lib/learning/server";
import { saveResource } from "../learning-actions";
import { AccountPrompt, Heading, SourceCard } from "../learning-ui";

export default async function Discover({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; compare?: string | string[] }> }) {
  const query = await searchParams;
  const topic = topicSchema.safeParse(query.q);
  const needsLogin = topic.success && discoveryConfigured() && !(await learner());
  const discovery = topic.success && !needsLogin ? await discover(topic.data) : null;
  const selected = new Set([query.compare].flat());
  const comparison = discovery?.results.filter(result => selected.has(result.url)).slice(0, 4) ?? [];

  return <>
    <Heading title="Discover">Find lectures, open courses, and new directions for your studies.</Heading>
    <form className="search-form" action="/discover">
      <label>Subject<input name="q" defaultValue={topic.success ? topic.data : ""} placeholder="e.g. Financial modelling" minLength={2} maxLength={120} required /></label>
      <button className="button">Search</button>
    </form>
    {query.q !== undefined && !topic.success && <p role="alert">Enter a subject between 2 and 120 characters.</p>}
    {query.error && <p role="alert">This source couldn’t be saved. Search again and retry.</p>}
    {needsLogin && <AccountPrompt />}
    {discovery && !discovery.configured && <p role="status">Connect a web or video search provider to discover sources.</p>}
    {!!discovery?.failed && <p role="alert">Some search providers are unavailable. Results may be incomplete.</p>}
    {discovery?.configured && discovery.results.length === 0 && <p>No results available for this search.</p>}
    {comparison.length > 0 && <section aria-labelledby="comparison">
      <h2 id="comparison">Compare sources</h2>
      <div className="comparison"><table>
        <thead><tr><th>Source</th><th>Publisher</th><th>Topic overlap</th><th>Access / license</th></tr></thead>
        <tbody>{comparison.map(source => <tr key={source.url}><th scope="row"><a href={source.url}>{source.title}</a></th><td>{source.publisher}</td><td>{relevance(topic.data!, source)}%</td><td>Unverified</td></tr>)}</tbody>
      </table></div>
    </section>}
    {topic.success && !!discovery?.results.length && <>
      <p>Ranked by matching topic words in the source title and description.</p>
      <form id="compare" action="/discover"><input type="hidden" name="q" value={topic.data} /><button className="text-link">Compare selected sources</button></form>
      <div className="resource-grid">{discovery.results.map(source => <SourceCard key={source.url} source={source}>
        <p>{relevance(topic.data, source)}% topic overlap</p>
        <label className="check"><input form="compare" name="compare" type="checkbox" value={source.url} defaultChecked={selected.has(source.url)} /> Compare</label>
        <form action={saveResource}>
          <input type="hidden" name="topic" value={topic.data} />
          <input type="hidden" name="url" value={source.url} />
          <button className="text-link">Save to Library</button>
        </form>
      </SourceCard>)}</div>
    </>}
  </>;
}
