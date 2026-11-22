import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { GET, POST } from "../app/api/v1/integration/[...operation]/route";

test("companion HTTP handlers validate tokens, scopes, limits and quiz submission", async () => {
  const owner = "10000000-0000-4000-8000-000000000001";
  const quizId = "20000000-0000-4000-8000-000000000001";
  const lessonId = "30000000-0000-4000-8000-000000000001";
  const key = "40000000-0000-4000-8000-000000000001";
  let scopes = ["quizzes:write"];
  let count = 1;
  let revoked = false;
  let grade: unknown;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname.split("/").at(-1);
    const input = [];
    for await (const chunk of req) input.push(chunk);
    const body = input.length ? JSON.parse(Buffer.concat(input).toString()) : {};
    res.setHeader("Content-Type", "application/json");
    let data: unknown;
    switch (path) {
      case "companion_connections":
        assert.match(url.searchParams.get("digest") ?? "", /^eq\.[a-f0-9]{64}$/);
        data = [{ id: owner, owner, scopes, expires_at: "2099-01-01T00:00:00Z", revoked_at: revoked ? "2025-01-01" : null }];
        break;
      case "allowed_learners": data = [{ user_id: owner }]; break;
      case "count_companion_call": data = count; break;
      case "companion_quizzes":
        assert.equal(url.searchParams.get("connection_id"), "eq." + owner);
        data = [{ lesson_id: lessonId, expires_at: "2099-01-01T00:00:00Z" }];
        break;
      case "grade_learning_attempt": grade = body; data = 1; break;
      case "companion_audit": data = null; break;
      default: res.statusCode = 503; data = { message: "upstream failure" };
    }
    res.end(JSON.stringify(data));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-service-key";
  try {
    const prefix = "http://localhost/api/v1/integration/";
    const authorization = "Bearer ale_" + "x".repeat(43);
    const progress = { params: Promise.resolve({ operation: ["progress"] }) };
    assert.equal((await GET(new Request(prefix + "progress"), progress)).status, 401);
    assert.equal((await GET(new Request(prefix + "progress", { headers: { authorization } }), progress)).status, 403);
    revoked = true;
    assert.equal((await GET(new Request(prefix + "progress", { headers: { authorization } }), progress)).status, 401);
    revoked = false;
    count = 61;
    assert.equal((await GET(new Request(prefix + "progress", { headers: { authorization } }), progress)).status, 429);
    count = 1;
    scopes = ["progress:read", "quizzes:write"];
    assert.equal((await GET(new Request(prefix + "progress", { headers: { authorization } }), progress)).status, 503);
    const request = new Request(prefix + `quizzes/${quizId}/attempts`, {
      method: "POST",
      headers: { authorization, "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify({ answers: [1] }),
    });
    const response = await POST(request, { params: Promise.resolve({ operation: ["quizzes", quizId, "attempts"] }) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { score: 1 });
    assert.deepEqual(grade, { p_owner: owner, p_lesson: lessonId, p_submission: (grade as { p_submission: string }).p_submission, p_answers: [1] });
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
