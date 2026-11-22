"use client";

import { useActionState, useState, type FormEvent } from "react";
import { issueCredential } from "./actions";

export function IssueForm({ scopes }: { scopes: readonly string[] }) {
  const [result, action, pending] = useActionState(issueCredential, {});
  return <form action={action}>
    {result.error && <p role="alert">{result.error}</p>}
    {result.token && <div role="status"><p>Copy this credential now. It expires in seven days.</p><code className="token">{result.token}</code></div>}
    <label>Connection name<input name="label" maxLength={80} required /></label>
    <fieldset><legend>Permissions</legend>
      {scopes.map(scope => <label className="check" key={scope}><input name="scope" type="checkbox" value={scope} />{scope}</label>)}
    </fieldset>
    <button className="button" disabled={pending}>{pending ? "Issuing…" : "Issue credential"}</button>
  </form>;
}

export function TestConsole() {
  const [operation, setOperation] = useState("progress");
  const [output, setOutput] = useState("");
  const [pending, setPending] = useState(false);

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const isWrite = ["quizzes", "attempts", "context", "activity"].includes(operation);
    const path = operation === "attempts" ? `quizzes/${encodeURIComponent(String(data.get("quiz")))}/attempts` : operation;
    const headers: Record<string, string> = { Authorization: `Bearer ${data.get("token")}` };
    if (isWrite) headers["Content-Type"] = "application/json";
    if (isWrite && operation !== "quizzes") headers["Idempotency-Key"] = String(data.get("key") || crypto.randomUUID());
    setPending(true);
    try {
      const response = await fetch(`/api/v1/integration/${path}`, {
        method: isWrite ? "POST" : "GET", headers, body: isWrite ? String(data.get("body")) : undefined,
      });
      setOutput(`HTTP ${response.status}\n${headers["Idempotency-Key"] ? `Idempotency-Key: ${headers["Idempotency-Key"]}\n` : ""}${JSON.stringify(await response.json(), null, 2)}`);
    } catch {
      setOutput("The request could not be completed.");
    } finally {
      setPending(false);
    }
  }

  const writes = ["quizzes", "attempts", "context", "activity"].includes(operation);
  return <form onSubmit={run}>
    <label>Credential<input name="token" type="password" autoComplete="off" required /></label>
    <label>Operation<select value={operation} onChange={event => setOperation(event.target.value)}>
      {["progress", "recommendations", "daily-learning", "revision-due", "quizzes", "attempts", "activity", "context"].map(item => <option key={item}>{item}</option>)}
    </select></label>
    {operation === "attempts" && <label>Quiz ID<input name="quiz" required /></label>}
    {writes && <label>JSON request body<textarea name="body" maxLength={8192} required rows={4} /></label>}
    {writes && operation !== "quizzes" && <label>Idempotency key (optional UUID)<input name="key" /></label>}
    {writes && <p>This request writes to your account. Use a separate Supabase project for integration testing.</p>}
    <button className="button" disabled={pending}>{pending ? "Sending…" : "Send request"}</button>
    {output && <pre className="token" role="status">{output}</pre>}
  </form>;
}
