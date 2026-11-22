import { createHash, createHmac } from "node:crypto";

export const operations = {
  recommendations: { method: "GET", scope: "recommendations:read" },
  "daily-learning": { method: "GET", scope: "recommendations:read" },
  "revision-due": { method: "GET", scope: "revision:read" },
  progress: { method: "GET", scope: "progress:read" },
  quizzes: { method: "POST", scope: "quizzes:write" },
  attempts: { method: "POST", scope: "quizzes:write" },
  activity: { method: "POST", scope: "activity:write" },
  context: { method: "POST", scope: "context:write" },
} as const;

export const companionScopes = ["recommendations:read", "revision:read", "progress:read", "quizzes:write", "activity:write", "context:write"] as const;
export const digest = (token: string) => createHash("sha256").update(token).digest("hex");
export const isToken = (token: string) => /^ale_[a-zA-Z0-9_-]{43}$/.test(token);
export const webhookSignature = (secret: string, timestamp: string, payload: string) =>
  createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");

export type CompanionOperation = keyof typeof operations;
export function matchOperation(parts: string[]): CompanionOperation | null {
  if (parts.length === 3 && parts[0] === "quizzes" && parts[2] === "attempts") return "attempts";
  return parts.length === 1 && parts[0] !== "attempts" && Object.hasOwn(operations, parts[0])
    ? parts[0] as CompanionOperation : null;
}
