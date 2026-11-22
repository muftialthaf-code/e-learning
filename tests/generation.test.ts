import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { generateLesson, type GenerationProvider } from "../lib/learning/ai";

test("lesson generation honors the budget and reopens persisted content without another call", async () => {
  const owner = "10000000-0000-4000-8000-000000000001";
  const id = "20000000-0000-4000-8000-000000000001";
  const lessonBody = {
    title: "Linear maps", concept: "linear maps", objectives: ["Identify a linear map"],
    sections: [
      { title: "Definition", explanation: "A linear map preserves vector addition and scalar multiplication." },
      { title: "Example", explanation: "Scaling all coordinates by two is a linear transformation." },
    ],
    exercise: "Check whether adding one to every coordinate preserves zero.",
    questions: [{ prompt: "What must a linear map preserve?", options: ["Zero", "Distance", "All coordinates", "Shape"], correct: 0, explanation: "The zero vector always maps to zero." }],
  };
  let budget = false;
  let persisted: { id: string; body: unknown } | null = null;
  let calls = 0;
  let settled = false;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const name = url.pathname.split("/").at(-1);
    let data: unknown;
    if (name === "reserve_learning_ai") data = budget;
    if (name === "lessons" && req.method === "GET") {
      assert.equal(url.searchParams.get("owner"), "eq." + owner);
      data = persisted ? [{ id: persisted.id }] : [];
    }
    if (name === "lessons" && req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      assert.equal(body.owner, owner);
      persisted = { id, body: body.body };
      data = { id };
    }
    if (name === "ai_usage" && req.method === "PATCH") { settled = true; data = null; }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data ?? null));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-service-key";
  const provider: GenerationProvider = {
    version: "fixture:v1", estimate: () => 100,
    async generate() { calls++; return { body: lessonBody, amount: 40 }; },
  };
  try {
    const generate = () => generateLesson(owner, "Linear maps", 10, undefined, "intermediate", provider);
    assert.match((await generate()).error ?? "", /budget/);
    assert.equal(calls, 0);
    budget = true;
    assert.deepEqual(await generate(), { id });
    assert.deepEqual(persisted, { id, body: lessonBody });
    assert(settled);
    assert.deepEqual(await generate(), { id });
    assert.equal(calls, 1);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
