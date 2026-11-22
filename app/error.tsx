"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section className="panel">
    <h1>This page couldn’t load.</h1>
    <button className="button" onClick={reset}>Try again</button>
  </section>;
}
