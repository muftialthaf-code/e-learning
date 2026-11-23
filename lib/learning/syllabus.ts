import { isIP } from "node:net";
import { z } from "zod";
import { topicSchema } from "./model";

const sectionName = /^(?:course\s+)?(?:syllabus|curriculum|outline|schedule|(?:course )?content|modules|lessons|topics covered)(?:\s+overview)?\s*:?$/i;
const moduleName = /^(?:module|lesson|week|unit|section|chapter)\s*\d+\s*[:.\-–—)]\s*\S/i;
const utility = /^(?:overview|course overview|introduction to the course|read more|learn more|view all|expand all|show more|sign in|log in|enroll(?: now)?|sign up|resources|frequently asked questions|related courses|download.*)$/i;
const responseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    markdown: z.string(),
    metadata: z.object({ sourceURL: z.string().optional(), url: z.string().optional() }).optional(),
  }),
});

export const syllabusTitles = z.array(topicSchema).max(20);
export const syllabusCacheMs = 24 * 60 * 60 * 1000;

export function publisherPage(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || url.port || !host.includes(".")
        || isIP(host) || isIP(host.replace(/^\[|\]$/g, ""))
        || /\.(?:local|localhost|internal|test|invalid|example|onion|lan|home|arpa)$/i.test(host)) return null;
    url.hash = "";
    return url;
  } catch { return null; }
}

function cleanTitle(text: string) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+#+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractSyllabus(markdown: string): string[] {
  const titles = new Map<string, string>();
  let sectionLevel: number | null = null;
  let fenced = false;
  for (const raw of markdown.slice(0, 240_000).split(/\r?\n/)) {
    if (raw.trimStart().startsWith("```")) { fenced = !fenced; continue; }
    if (fenced) continue;
    const heading = /^(#{1,6})\s+(.+)$/.exec(raw.trim());
    const list = /^(?:[-*+]|\d+[.)])\s+(.+)$/.exec(raw.trim());
    const text = cleanTitle(heading?.[2] ?? list?.[1] ?? raw);
    if (heading) {
      const level = heading[1].length;
      if (sectionLevel !== null && level <= sectionLevel) sectionLevel = null;
      if (sectionName.test(text)) { sectionLevel = level; continue; }
    }
    const explicit = moduleName.test(text);
    if ((!explicit && (sectionLevel === null || !(heading || list))) || utility.test(text) || /[.!?]$/.test(text)) continue;
    const parsed = topicSchema.safeParse(text);
    if (!parsed.success) continue;
    const key = parsed.data.toLowerCase().replace(/^(?:module|lesson|week|unit|section|chapter)\s*\d+\s*[:.\-–—)]\s*/i, "");
    if (!titles.has(key)) titles.set(key, parsed.data);
    if (titles.size === 20) break;
  }
  return [...titles.values()];
}

export async function fetchPublisherSyllabus(source: string, key: string, fetcher = fetch) {
  const url = publisherPage(source);
  if (!url) throw new Error("Unsupported publisher URL");
  const response = await fetcher("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: url.href, formats: ["markdown"], onlyMainContent: true, timeout: 15000 }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("Publisher page unavailable");
  const { data } = responseSchema.parse(await response.json());
  const final = publisherPage(data.metadata?.url ?? data.metadata?.sourceURL ?? source);
  if (!final || final.hostname.replace(/^www\./, "") !== url.hostname.replace(/^www\./, "")) {
    throw new Error("Publisher page redirected to a different site");
  }
  return extractSyllabus(data.markdown);
}
