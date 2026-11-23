"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { admin, learner } from "../../../lib/learning/server";
import { topicSchema } from "../../../lib/learning/model";
import { fetchPublisherSyllabus, publisherPage, syllabusCacheMs, syllabusTitles } from "../../../lib/learning/syllabus";

const uuid = z.uuid();

async function courseContext(form: FormData) {
  const account = await learner();
  if (!account) redirect("/settings");
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) redirect("/university");
  return { account, id: id.data, path: `/university/${id.data}` };
}

async function publisherContext(form: FormData) {
  const context = await courseContext(form);
  const { account, id, path } = context;
  const result = await account.client.from("resources").select("url,kind").eq("id", id).eq("approved", true).maybeSingle();
  if (result.error) redirect(`${path}?publisher=source#syllabus`);
  if (!result.data) redirect("/university");
  if (result.data.kind !== "course" || !publisherPage(result.data.url)) redirect(`${path}?publisher=unsupported#syllabus`);
  return { ...context, source: result.data.url as string };
}

export async function previewPublisherSyllabus(form: FormData) {
  const { account, id, path, source } = await publisherContext(form);
  const db = admin();
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key || !db) redirect(`${path}?publisher=setup#syllabus`);
  const cached = await account.client.from("syllabus_previews").select("fetched_at,titles")
    .eq("resource_id", id).eq("source_url", source).maybeSingle();
  if (cached.error) redirect(`${path}?publisher=storage#syllabus`);
  if (cached.data && Date.now() - Date.parse(cached.data.fetched_at) < syllabusCacheMs) {
    redirect(`${path}?publisher=${cached.data.titles.length ? "ready" : "empty"}#syllabus`);
  }

  let titles: string[];
  try { titles = await fetchPublisherSyllabus(source, key); }
  catch { redirect(`${path}?publisher=unavailable#syllabus`); }

  const { error } = await db.from("syllabus_previews").upsert({
    owner: account.owner, resource_id: id, source_url: source, titles, fetched_at: new Date().toISOString(),
  });
  if (error) redirect(`${path}?publisher=storage#syllabus`);
  redirect(`${path}?publisher=${titles.length ? "ready" : "empty"}#syllabus`);
}

export async function addPublisherModules(form: FormData) {
  const { account, id, path, source } = await publisherContext(form);
  const chosen = syllabusTitles.safeParse(form.getAll("title"));
  if (!chosen.success || chosen.data.length === 0) redirect(`${path}?publisher=choose#syllabus`);
  const db = admin();
  if (!db) redirect(`${path}?publisher=setup#syllabus`);
  const preview = await account.client.from("syllabus_previews").select("titles")
    .eq("resource_id", id).eq("source_url", source).maybeSingle();
  const titles = syllabusTitles.safeParse(preview.data?.titles);
  if (!titles.success) redirect(`${path}?publisher=storage#syllabus`);
  const selected = new Set(chosen.data);
  const matching = titles.data.filter(title => selected.has(title));
  if (matching.length !== selected.size) redirect(`${path}?publisher=choose#syllabus`);

  const { error } = await db.from("course_modules").upsert(matching.map(title => ({
    owner: account.owner, resource_id: id, title, publisher_url: source, publisher_title: title,
  })), { onConflict: "owner,resource_id,title", ignoreDuplicates: true });
  redirect(`${path}?publisher=${error ? "storage" : "added"}#syllabus`);
}

export async function editModule(form: FormData) {
  const { account, id, path } = await courseContext(form);
  const moduleId = uuid.safeParse(form.get("module"));
  const title = topicSchema.safeParse(form.get("title"));
  if (!moduleId.success || !title.success) redirect(`${path}?error=rename#syllabus`);
  const result = await account.client.from("course_modules").update({ title: title.data })
    .eq("resource_id", id).eq("id", moduleId.data).select("id").maybeSingle();
  if (result.error?.code === "23505") redirect(`${path}?error=duplicate#syllabus`);
  redirect(result.error || !result.data ? `${path}?error=rename#syllabus` : `${path}#syllabus`);
}

export async function removeModule(form: FormData) {
  const { account, id, path } = await courseContext(form);
  const moduleId = uuid.safeParse(form.get("module"));
  if (!moduleId.success) redirect(`${path}?error=remove#syllabus`);
  const result = await account.client.from("course_modules").delete()
    .eq("resource_id", id).eq("id", moduleId.data).select("id").maybeSingle();
  redirect(result.error ? `${path}?error=remove#syllabus` : `${path}#syllabus`);
}
