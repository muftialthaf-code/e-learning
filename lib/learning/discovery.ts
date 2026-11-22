import { relevance, resourceSchema, type Resource } from "./model";

function collect(rows: unknown[]) {
  return rows.flatMap(row => {
    const parsed = resourceSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

export async function discover(topic: string, fetcher = fetch, config: Record<string, string | undefined> = process.env) {
  const checked_at = new Date().toISOString();
  const providers: Promise<Resource[]>[] = [];
  const brave = config.BRAVE_SEARCH_API_KEY;
  const youtube = config.YOUTUBE_API_KEY;

  if (brave) providers.push((async () => {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.search = new URLSearchParams({ q: `${topic} free open course syllabus`, count: "12" }).toString();
    const response = await fetcher(url, {
      headers: { "X-Subscription-Token": brave, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error("Search provider failed");
    const data = await response.json() as { web?: { results?: { url: string; title: string; description: string }[] } };
    return collect((data.web?.results ?? []).map(row => {
      let publisher = "";
      try { publisher = new URL(row.url).hostname; } catch { /* Invalid URLs are discarded. */ }
      return { ...row, publisher, checked_at, kind: "course", provenance: "web_search" };
    }));
  })());

  if (youtube) providers.push((async () => {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.search = new URLSearchParams({ q: `${topic} lecture tutorial`, part: "snippet", type: "video", maxResults: "8", key: youtube }).toString();
    const response = await fetcher(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("Video provider failed");
    const data = await response.json() as { items?: { id: { videoId: string }; snippet: { title: string; description: string; channelTitle: string } }[] };
    return collect((data.items ?? []).filter(row => /^[\w-]{11}$/.test(row.id.videoId)).map(({ id, snippet }) => ({
      url: `https://www.youtube.com/watch?v=${id.videoId}`,
      title: snippet.title,
      description: snippet.description,
      publisher: snippet.channelTitle,
      kind: "video",
      provenance: "youtube",
      checked_at,
    })));
  })());

  const settled = await Promise.allSettled(providers);
  const unique = new Map<string, Resource>();
  for (const provider of settled) {
    if (provider.status === "fulfilled") {
      for (const result of provider.value) unique.set(result.url, result);
    }
  }
  return {
    configured: providers.length > 0,
    failed: settled.filter(result => result.status === "rejected").length,
    results: [...unique.values()].sort((a, b) => relevance(topic, b) - relevance(topic, a)),
  };
}
