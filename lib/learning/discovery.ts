import { z } from "zod";
import { relevance, resourceSchema, type Resource } from "./model";

function collect(rows: unknown[]) {
  return rows.flatMap(row => {
    const parsed = resourceSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

const firecrawlResponse = z.object({
  success: z.literal(true),
  data: z.object({ web: z.array(z.unknown()).optional() }),
});
const firecrawlResult = z.object({
  url: z.string(),
  title: z.string(),
  description: z.string().nullish(),
});

type DiscoveryConfig = Record<string, string | undefined>;

export function discoveryConfigured(config: DiscoveryConfig = process.env) {
  return Boolean(config.FIRECRAWL_API_KEY || config.YOUTUBE_API_KEY);
}

export async function discover(topic: string, fetcher = fetch, config: DiscoveryConfig = process.env) {
  const checked_at = new Date().toISOString();
  const providers: Promise<Resource[]>[] = [];
  const firecrawl = config.FIRECRAWL_API_KEY;
  const youtube = config.YOUTUBE_API_KEY;

  if (firecrawl) providers.push((async () => {
    const response = await fetcher("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${firecrawl}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: `${topic} free open course syllabus`, limit: 5, sources: ["web"] }),
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error("Search provider failed");
    const { data } = firecrawlResponse.parse(await response.json());
    return collect((data.web ?? []).flatMap(item => {
      const row = firecrawlResult.safeParse(item);
      if (!row.success) return [];
      let publisher = "";
      try { publisher = new URL(row.data.url).hostname; } catch { return []; }
      return [{
        url: row.data.url,
        title: row.data.title.slice(0, 300),
        description: row.data.description?.slice(0, 1600) ?? "",
        publisher,
        checked_at,
        kind: "course",
        provenance: "web_search",
      }];
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
