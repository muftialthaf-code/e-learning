"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { discover } from "../lib/learning/discovery";
import { generateLesson, generateFeedback } from "../lib/learning/ai";
import { admin, learner } from "../lib/learning/server";
import { resourceSchema, topicSchema, type Lesson, type SavedResource } from "../lib/learning/model";

const uuid = z.uuid();

export async function saveResource(form: FormData) {
  const account = await learner();
  if (!account) redirect("/settings");
  const topic = topicSchema.safeParse(form.get("topic"));
  if (!topic.success) redirect("/discover");
  const destination = `/discover?q=${encodeURIComponent(topic.data)}`;
  const { results } = await discover(topic.data);
  const resource = results.find(item => item.url === form.get("url"));
  if (!resource) redirect(`${destination}&error=unavailable`);
  const { error } = await account.client.from("resources").upsert(
    resourceSchema.parse(resource), { onConflict: "owner,url" },
  );
  if (error) redirect(`${destination}&error=save`);
  redirect("/library");
}

export async function approveResource(form: FormData) {
  const account = await learner();
  if (!account) redirect("/settings");
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) redirect("/library?error=save");
  const { error } = await account.client.from("resources").update({ approved: true }).eq("id", id.data);
  redirect(error ? "/library?error=save" : "/university");
}

export async function createLesson(form: FormData) {
  const account = await learner();
  if (!account) redirect("/settings");
  const topic = topicSchema.safeParse(form.get("topic"));
  const minutes = z.coerce.number().int().min(5).max(15).safeParse(form.get("minutes"));
  const resourceId = form.get("resource");
  if (!topic.success || !minutes.success) redirect("/quick?error=Enter%20a%20topic%20and%20a%20duration%20from%205%20to%2015.");
  let resource: SavedResource | undefined;
  if (resourceId) {
    const id = uuid.safeParse(resourceId);
    if (!id.success) redirect("/quick?error=Choose%20a%20saved%20source.");
    const result = await account.client.from("resources").select("*").eq("id", id.data).maybeSingle();
    if (!result.data) redirect("/quick?error=Source%20unavailable.");
    resource = result.data as SavedResource;
  }
  const moduleId = form.get("module");
  let courseModule: { id: string; lesson_id: string | null } | null = null;
  if (moduleId) {
    const id = uuid.safeParse(moduleId);
    if (!id.success || !resource?.approved) redirect("/university");
    const match = await account.client.from("course_modules").select("id,lesson_id")
      .eq("id", id.data).eq("resource_id", resource.id).eq("title", topic.data).maybeSingle();
    if (!match.data) redirect("/university");
    courseModule = match.data;
    if (courseModule?.lesson_id) redirect(`/study/${courseModule.lesson_id}`);
  }
  const profile = await account.client.from("profiles").select("difficulty").eq("id", account.owner).maybeSingle();
  if (profile.error) redirect("/quick?error=Learning%20preferences%20could%20not%20be%20loaded.");
  const result = await generateLesson(account.owner, topic.data, minutes.data, resource, profile.data?.difficulty);
  if (result.id) {
    if (courseModule) {
      const update = await admin()?.from("course_modules").update({ lesson_id: result.id })
        .eq("owner", account.owner).eq("id", courseModule.id).is("lesson_id", null);
      if (update?.error) redirect(`/university/${resource!.id}?error=module`);
    }
    redirect(`/study/${result.id}`);
  }
  redirect(`/quick?error=${encodeURIComponent(result.error ?? "Generation failed.")}`);
}

export async function saveStudy(form: FormData) {
  const account = await learner();
  if (!account) redirect("/settings");
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) redirect("/quick");
  const notes = String(form.get("notes") ?? "");
  const path = `/study/${id.data}`;
  if (notes.length > 12000) redirect(`${path}?error=notes`);
  const { error, data } = await account.client.from("lessons")
    .update({ notes, bookmarked: form.get("bookmarked") === "on" }).eq("id", id.data).select("id").maybeSingle();
  if (error || !data) redirect(`${path}?error=save`);
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}

export async function gradeStudy(form: FormData) {
  const account = await learner();
  if (!account) redirect("/settings");
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) redirect("/quick");
  const path = `/study/${id.data}`;
  const submission = uuid.safeParse(form.get("submission"));
  const db = admin();
  if (!submission.success || !db) redirect(`${path}?error=grade`);
  const { data } = await db.from("lessons").select("body").eq("owner", account.owner).eq("id", id.data).maybeSingle();
  if (!data) redirect(`${path}?error=grade`);
  const answers = (data.body as Lesson["body"]).questions.map((_, i) => {
    const answer = form.get(`answer-${i}`);
    return typeof answer === "string" && /^[0-3]$/.test(answer) ? Number(answer) : null;
  });
  if (answers.includes(null)) redirect(`${path}?error=answers`);
  const { error } = await db.rpc("grade_learning_attempt", {
    p_owner: account.owner, p_lesson: id.data, p_submission: submission.data, p_answers: answers,
  });
  if (error) redirect(`${path}?error=grade`);
  redirect(`${path}?attempt=${submission.data}`);
}

export async function saveBudget(form: FormData) {
  const account = await learner();
  if (!account) redirect("/settings");
  const raw = String(form.get("budget") ?? "");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(raw) || Number(raw) > 100) redirect("/settings?status=budget-invalid");
  const { error } = await account.client.from("ai_budgets").upsert({
    owner: account.owner, monthly_micros: Math.round(Number(raw) * 1_000_000),
  });
  redirect(error ? "/settings?status=budget-error" : "/settings?status=budget-saved");
}

export async function addModule(form: FormData) {
  const account = await learner();
  if (!account) redirect("/settings");
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) redirect("/university");
  const path = `/university/${id.data}`;
  const title = topicSchema.safeParse(form.get("title"));
  if (!title.success) redirect(`${path}?error=module`);
  const { error } = await account.client.from("course_modules").insert({ resource_id: id.data, title: title.data });
  redirect(error ? `${path}?error=module` : path);
}

export async function importResource(form: FormData) {
  const account = await learner();
  if (!account) redirect("/settings");
  const input = z.url({ protocol: /^https$/ }).max(2048).safeParse(form.get("url"));
  if (!input.success) redirect("/library?error=import");
  const url = new URL(input.data);
  url.hash = "";
  const resource = resourceSchema.safeParse({
    url: url.toString(),
    title: form.get("title"),
    publisher: url.hostname,
    description: form.get("description"),
    checked_at: new Date().toISOString(),
    kind: "course",
    provenance: "manual",
  });
  if (!resource.success) redirect("/library?error=import");
  const { error } = await account.client.from("resources").upsert(resource.data, { onConflict: "owner,url" });
  redirect(error ? "/library?error=import" : "/library");
}

export async function savePractice(form: FormData) {
  const account = await learner();
  if (!account) redirect("/settings");
  const id = uuid.safeParse(form.get("id"));
  const response = z.string().trim().min(1).max(12000).safeParse(form.get("response"));
  if (!id.success) redirect("/quick");
  const path = `/study/${id.data}`;
  if (!response.success) redirect(`${path}?error=practice#practice`);
  const { error } = await account.client.from("practice_responses").upsert({ lesson_id: id.data, response: response.data, updated_at: new Date().toISOString() }, { onConflict: "owner,lesson_id" });
  redirect(error ? `${path}?error=practice#practice` : `${path}?saved=practice#practice`);
}

export async function submitExam(form: FormData) {
  const account = await learner();
  if (!account) redirect("/settings");
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) redirect("/university");
  const path = `/university/${id.data}/exam`;
  const submission = uuid.safeParse(form.get("submission"));
  const db = admin();
  if (!db || !submission.success) redirect(`${path}?error=1`);
  const answers: Record<string, number[]> = {};
  for (const [field, value] of form) {
    if (!field.startsWith("answer-")) continue;
    const match = /^answer-([a-f0-9-]{36})-([0-4])$/.exec(field);
    if (!match || !uuid.safeParse(match[1]).success || typeof value !== "string" || !/^[0-3]$/.test(value)) redirect(`${path}?error=1`);
    (answers[match[1]] ??= [])[Number(match[2])] = Number(value);
  }
  if (Object.keys(answers).length > 20) redirect(`${path}?error=1`);
  const { error } = await db.rpc("grade_course_exam", {
    p_owner: account.owner, p_course: id.data, p_submission: submission.data, p_answers: answers,
  });
  redirect(error ? `${path}?error=1` : `${path}?attempt=${submission.data}`);
}

export async function importSyllabus(form: FormData) {
  const account = await learner();
  if (!account) redirect("/settings");
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) redirect("/university");
  const path = `/university/${id.data}`;
  const raw = String(form.get("syllabus") ?? "");
  if (raw.length > 2600) redirect(`${path}?error=module`);
  const lines = [...new Set(raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean))];
  const parsed = z.array(topicSchema).min(1).max(20).safeParse(lines);
  if (!parsed.success) redirect(`${path}?error=module`);
  const { error } = await account.client.from("course_modules").upsert(parsed.data.map(title => ({
    owner: account.owner, resource_id: id.data, title,
  })), { onConflict: "owner,resource_id,title", ignoreDuplicates: true });
  redirect(error ? `${path}?error=module` : path);
}

export async function requestPracticeFeedback(form: FormData) {
  const account = await learner();
  if (!account) redirect("/settings");
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) redirect("/quick");
  const path = `/study/${id.data}`;
  const db = admin();
  if (!db) redirect(`${path}?feedbackError=Server%20configuration%20required.#practice`);
  const [lesson, practice] = await Promise.all([
    db.from("lessons").select("body").eq("owner", account.owner).eq("id", id.data).maybeSingle(),
    account.client.from("practice_responses").select("response").eq("lesson_id", id.data).maybeSingle(),
  ]);
  if (!lesson.data || !practice.data) redirect(`${path}?feedbackError=Save%20a%20response%20first.#practice`);
  const content = lesson.data.body as Lesson["body"];
  const feedback = await generateFeedback(account.owner, id.data, content.exercise, practice.data.response, content.objectives);
  if (!feedback.id) redirect(`${path}?feedbackError=${encodeURIComponent(feedback.error ?? "Feedback could not be recorded.")}#practice`);
  redirect(`${path}#practice`);
}
