import { test } from "node:test";
import assert from "node:assert/strict";
import { discover } from "../lib/learning/discovery";
import { openAIProvider } from "../lib/learning/ai";
import { estimateMicros, lessonSchema } from "../lib/learning/model";
import { isToken, matchOperation, webhookSignature } from "../lib/learning/companion";

test("discovery merges real provider contracts, validates provenance and tolerates partial failure", async () => {
  const result = await discover("linear algebra", async input => {
    const url = new URL(String(input));
    assert(url.searchParams.get("q")?.includes("linear algebra"));
    return url.hostname === "api.search.brave.com" ? Response.json({
      web: { results: [
        { title: "Linear Algebra", url: "https://ocw.mit.edu/", description: "Open course" },
        { title: "Bad", url: "javascript:alert(1)", description: "Ignored" },
      ] },
    }) : new Response(null, { status: 429 });
  }, { BRAVE_SEARCH_API_KEY: "fake-search", YOUTUBE_API_KEY: "fake-video" });
  assert.equal(result.failed, 1);
  assert.deepEqual(result.results.map(x => [x.title, x.publisher, x.kind]), [["Linear Algebra", "ocw.mit.edu", "course"]]);
});

test("AI adapter sends capped output, parses provider usage and schema validation rejects bad lessons", async () => {
  const provider = openAIProvider(async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/chat/completions");
    assert.equal(JSON.parse(String(init?.body)).max_completion_tokens, 3600);
    return Response.json({ choices: [{ message: { content: "{}" } }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
  }, { AI_API_KEY: "fake-ai", AI_MODEL: "fake-model", AI_INPUT_USD_PER_MILLION: "1", AI_OUTPUT_USD_PER_MILLION: "2" });
  assert(provider);
  assert(provider.estimate("prompt") > estimateMicros(100, 20, 1, 2));
  const generated = await provider.generate("prompt");
  assert.equal(generated.amount, 140);
  assert.equal(lessonSchema.safeParse(generated.body).success, false);
});

test("companion route recognizes only documented paths and signatures bind the raw body", () => {
  assert.equal(isToken("ale_" + "x".repeat(43)), true);
  assert.equal(isToken("ale_short"), false);
  assert.equal(matchOperation(["quizzes", "quiz-id", "attempts"]), "attempts");
  assert.equal(matchOperation(["attempts"]), null);
  const signed = webhookSignature("test", "1000", '{"ok":true}');
  assert.notEqual(signed, webhookSignature("test", "1001", '{"ok":true}'));
  assert.notEqual(signed, webhookSignature("test", "1000", '{"ok":false}'));
});
