import Link from "next/link";
import type { ReactNode } from "react";
import type { Resource } from "../lib/learning/model";

export function Heading({ title, children }: { title: string; children: ReactNode }) {
  return <header className="page-header"><h1>{title}</h1><p>{children}</p></header>;
}

export function AccountPrompt() {
  return <section className="panel"><p>Sign in to access your saved learning material.</p><Link className="text-link" href="/settings">Account settings →</Link></section>;
}

export function SourceCard({ source, children }: { source: Resource; children?: ReactNode }) {
  const origin = { web_search: "Web search", youtube: "YouTube search", manual: "Added by you" }[source.provenance];
  return <article className="resource-card">
    <p className="eyebrow">{origin} · {source.publisher}</p>
    <h2><a href={source.url} target="_blank" rel="noreferrer">{source.title} →</a></h2>
    {source.description && <p>{source.description}</p>}
    <small>Recorded {source.checked_at.slice(0, 10)} · Access and license unverified</small>
    {children}
  </article>;
}

export function Video({ source }: { source: Resource }) {
  const url = new URL(source.url);
  const id = url.hostname === "www.youtube.com" && url.pathname === "/watch" ? url.searchParams.get("v") : null;
  return id && /^[\w-]{11}$/.test(id)
    ? <iframe className="video" title={source.title} src={`https://www.youtube-nocookie.com/embed/${id}`} loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
    : null;
}
