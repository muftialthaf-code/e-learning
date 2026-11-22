import { z } from "zod";
import { admin } from "../../../../../lib/learning/server";
import { digest, isToken, matchOperation, operations, type CompanionOperation } from "../../../../../lib/learning/companion";
import { type Lesson } from "../../../../../lib/learning/model";

const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
const fail = (message: string, status: number) => reply({ error: message }, status);
const uuid = z.uuid();
const quizRequest = z.object({ lessonId: uuid });
const attempt = z.object({ answers: z.array(z.number().int().min(0).max(3)).min(1).max(5) });
const context = z.object({ topics: z.array(z.string().trim().min(2).max(120)).min(1).max(10) });
const activity = z.object({ lessonId: uuid, minutes: z.number().int().min(1).max(180) });

type DB = NonNullable<ReturnType<typeof admin>>;
type Connection = { id: string; owner: string; scopes: string[]; expires_at: string; revoked_at: string | null };

async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json") || !request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8192) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
    return JSON.parse(body + decoder.decode()) as unknown;
  } catch { return null; }
}

async function dispatch(db: DB, connection: Connection, operation: CompanionOperation, parts: string[], request: Request) {
  const owner = connection.owner;
  switch (operation) {
    case "recommendations": {
      const result = await db.from("resources").select("id,title,url,publisher,kind").eq("owner", owner).eq("approved", true).order("checked_at", { ascending: false }).limit(10);
      return result.error ? fail("Data unavailable", 503) : reply({ recommendations: result.data });
    }
    case "daily-learning":
    case "revision-due": {
      const result = await db.from("mastery").select("concept,lesson_id,score,due_at").eq("owner", owner).lte("due_at", new Date().toISOString()).order("due_at").limit(20);
      if (result.error) return fail("Data unavailable", 503);
      if (operation === "revision-due") return reply({ reviews: result.data });
      if (result.data.length) return reply({ action: { type: "revision", ...result.data[0] } });
      const next = await db.from("lessons").select("id,topic,minutes").eq("owner", owner).is("completed_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return next.error ? fail("Data unavailable", 503) : reply({ action: next.data ? { type: "study", ...next.data } : null });
    }
    case "progress": {
      const result = await db.from("lessons").select("id,topic,minutes,completed_at,created_at").eq("owner", owner).order("created_at", { ascending: false }).limit(20);
      return result.error ? fail("Data unavailable", 503) : reply({ recentLessons: result.data });
    }
    case "quizzes": {
      const parsed = quizRequest.safeParse(await readJson(request));
      if (!parsed.success) return fail("Supply a lessonId", 400);
      const lesson = await db.from("lessons").select("id,body").eq("owner", owner).eq("id", parsed.data.lessonId).maybeSingle();
      if (lesson.error) return fail("Data unavailable", 503);
      if (!lesson.data) return fail("Lesson unavailable", 404);
      const issued = await db.from("companion_quizzes").insert({ connection_id: connection.id, lesson_id: lesson.data.id }).select("id,expires_at").single();
      if (issued.error) return fail("Quiz unavailable", 503);
      const questions = (lesson.data.body as Lesson["body"]).questions.map(({ prompt, options }) => ({ prompt, options }));
      return reply({ quizId: issued.data.id, expiresAt: issued.data.expires_at, questions }, 201);
    }
    case "attempts": {
      const ids = z.object({ quiz: uuid, key: uuid }).safeParse({ quiz: parts[1], key: request.headers.get("idempotency-key") });
      const parsed = attempt.safeParse(await readJson(request));
      if (!ids.success || !parsed.success) return fail("Supply valid answers and a UUID Idempotency-Key", 400);
      const quiz = await db.from("companion_quizzes").select("lesson_id,expires_at").eq("id", ids.data.quiz).eq("connection_id", connection.id).maybeSingle();
      if (quiz.error) return fail("Quiz unavailable", 503);
      if (!quiz.data) return fail("Quiz unavailable", 404);
      const submission = digest(`${connection.id}:${ids.data.quiz}:${ids.data.key}`).slice(0, 32)
        .replace(/^(........)(....)(....)(....)(............)$/, "$1-$2-$3-$4-$5");
      if (Date.parse(quiz.data.expires_at) <= Date.now()) {
        const prior = await db.from("attempts").select("score,answers").eq("owner", owner).eq("submission", submission).maybeSingle();
        if (prior.error) return fail("Assessment unavailable", 503);
        if (!prior.data) return fail("Quiz expired", 410);
        return JSON.stringify(prior.data.answers) === JSON.stringify(parsed.data.answers)
          ? reply({ score: Number(prior.data.score) }) : fail("Submission conflict", 409);
      }
      const result = await db.rpc("grade_learning_attempt", { p_owner: owner, p_lesson: quiz.data.lesson_id, p_submission: submission, p_answers: parsed.data.answers });
      if (result.error?.message === "Submission conflict") return fail("Submission conflict", 409);
      if (result.error?.message === "Invalid answers") return fail("Answer every question", 400);
      return result.error ? fail("Assessment unavailable", 503) : reply({ score: Number(result.data) });
    }
    case "activity":
    case "context": {
      const event = uuid.safeParse(request.headers.get("idempotency-key"));
      const parsed = (operation === "context" ? context : activity).safeParse(await readJson(request));
      if (!event.success || !parsed.success) return fail("Supply a valid JSON body and UUID Idempotency-Key", 400);
      if ("lessonId" in parsed.data) {
        const lesson = await db.from("lessons").select("id").eq("owner", owner).eq("id", parsed.data.lessonId).maybeSingle();
        if (lesson.error) return fail("Data unavailable", 503);
        if (!lesson.data) return fail("Lesson unavailable", 404);
      }
      const write = await db.from("companion_events").upsert({
        connection_id: connection.id, event_id: event.data, operation, payload: parsed.data,
      }, { onConflict: "connection_id,event_id", ignoreDuplicates: true }).select("event_id").maybeSingle();
      if (write.error) return fail("Event unavailable", 503);
      if (!write.data) {
        const previous = await db.from("companion_events").select("operation,payload").eq("connection_id", connection.id).eq("event_id", event.data).maybeSingle();
        if (previous.error || !previous.data) return fail("Event unavailable", 503);
        const priorBody = (operation === "context" ? context : activity).safeParse(previous.data.payload);
        if (previous.data.operation !== operation || !priorBody.success || JSON.stringify(priorBody.data) !== JSON.stringify(parsed.data)) return fail("Event conflict", 409);
      }
      return reply({ eventId: event.data }, write.data ? 201 : 200);
    }
  }
}

async function route(request: Request, { params }: { params: Promise<{ operation: string[] }> }) {
  const parts = (await params).operation;
  const operation = matchOperation(parts);
  if (!operation) return fail("Unknown operation", 404);
  const contract = operations[operation];
  if (contract.method !== request.method) return reply({ error: "Method not allowed" }, 405, { Allow: contract.method });
  const token = /^Bearer (\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  if (!isToken(token)) return fail("Unauthorized", 401);
  const db = admin();
  if (!db) return fail("Connector unavailable", 503);
  const lookup = await db.from("companion_connections").select("id,owner,scopes,expires_at,revoked_at").eq("digest", digest(token)).maybeSingle();
  if (lookup.error) return fail("Connector unavailable", 503);
  const connection = lookup.data as Connection | null;
  if (!connection || connection.revoked_at || Date.parse(connection.expires_at) <= Date.now()) return fail("Unauthorized", 401);
  const membership = await db.from("allowed_learners").select("user_id").eq("user_id", connection.owner).maybeSingle();
  if (membership.error) return fail("Connector unavailable", 503);
  if (!membership.data) return fail("Unauthorized", 401);
  const count = await db.rpc("count_companion_call", { p_connection: connection.id });
  if (count.error) return fail("Connector unavailable", 503);
  const response = Number(count.data) > 60
    ? reply({ error: "Rate limit exceeded" }, 429, { "Retry-After": "60" })
    : !connection.scopes.includes(contract.scope) ? fail("Permission denied", 403)
    : await dispatch(db, connection, operation, parts, request);
  const audit = await db.from("companion_audit").insert({ connection_id: connection.id, operation, status: response.status });
  if (audit.error) console.error("Companion audit write failed");
  return response;
}

export const GET = route;
export const POST = route;
