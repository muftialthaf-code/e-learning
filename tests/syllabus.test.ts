import assert from "node:assert/strict";
import { test } from "node:test";
import { extractSyllabus, fetchPublisherSyllabus, publisherPage } from "../lib/learning/syllabus";

test("extracts visible curriculum titles in order and skips unrelated copy", () => {
  const markdown = [
    "# Digital Marketing Certification",
    "- Take the course",
    "## Course curriculum",
    "### Lesson 1: Marketing fundamentals",
    "- [SEO](#seo)",
    "- **Content strategy**",
    "- [Enroll now](#join)",
    "## Reviews",
    "- Great course",
    "## Schedule",
    "- **SEO**",
    "### Week 4 – Measurement and analytics",
  ].join("\n");
  assert.deepEqual(extractSyllabus(markdown), [
    "Lesson 1: Marketing fundamentals", "SEO", "Content strategy", "Week 4 – Measurement and analytics",
  ]);
  assert.deepEqual(extractSyllabus("# About the course\n## What you’ll learn\n- Find new clients."), []);
});

test("fetches Markdown on demand and checks the returned publisher host", async () => {
  const source = "https://academy.hubspot.com/courses/digital-marketing#about";
  const result = await fetchPublisherSyllabus(source, "fixture", async (url, init) => {
    assert.equal(url, "https://api.firecrawl.dev/v2/scrape");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      url: "https://academy.hubspot.com/courses/digital-marketing",
      formats: ["markdown"], onlyMainContent: true, timeout: 15000,
    });
    return Response.json({ success: true, data: { markdown: "## Modules\n- SEO", metadata: { url: source } } });
  });
  assert.deepEqual(result, ["SEO"]);
  assert.equal(publisherPage("https://127.0.0.1:8443/"), null);
  assert.equal(publisherPage("https://printer.local/"), null);
  await assert.rejects(fetchPublisherSyllabus(source, "fixture", async () =>
    Response.json({ success: true, data: { markdown: "## Modules\n- SEO", metadata: { url: "https://unrelated.com" } } })),
  /different site/);
});
