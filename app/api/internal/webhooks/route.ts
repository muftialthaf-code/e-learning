import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { admin } from "../../../../lib/learning/server";
import { digest, webhookSignature } from "../../../../lib/learning/companion";

export async function POST(request: Request) {
  const worker = process.env.WEBHOOK_WORKER_TOKEN;
  const secret = process.env.WEBHOOK_SIGNING_SECRET;
  const target = z.url({ protocol: /^https$/ }).safeParse(process.env.WEBHOOK_TARGET_URL);
  const owner = z.uuid().safeParse(process.env.WEBHOOK_OWNER_ID);
  const supplied = request.headers.get("authorization") ?? "";
  if (!worker || !timingSafeEqual(Buffer.from(digest(supplied)), Buffer.from(digest(`Bearer ${worker}`)))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = admin();
  if (!secret || !target.success || !owner.success || !db) return Response.json({ error: "Webhook worker unavailable" }, { status: 503 });
  const membership = await db.from("allowed_learners").select("user_id").eq("user_id", owner.data).maybeSingle();
  if (membership.error) return Response.json({ error: "Webhook worker unavailable" }, { status: 503 });
  if (!membership.data) return Response.json({ error: "Webhook owner is not authorized" }, { status: 403 });
  const result = await db.rpc("claim_learning_webhooks", { p_owner: owner.data });
  if (result.error) return Response.json({ error: "Queue unavailable" }, { status: 503 });
  let delivered = 0;
  await Promise.all((result.data as { id: string; event_type: string; payload: unknown; created_at: string }[]).map(async event => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ id: event.id, type: event.event_type, createdAt: event.created_at, data: event.payload });
    try {
      const response = await fetch(target.data, {
        method: "POST", redirect: "error", body, signal: AbortSignal.timeout(8000),
        headers: {
          "Content-Type": "application/json",
          "X-Learning-Timestamp": timestamp,
          "X-Learning-Signature": webhookSignature(secret, timestamp, body),
          "X-Learning-Delivery": event.id,
        },
      });
      if (!response.ok) return;
      const write = await db.from("webhook_outbox").update({ delivered_at: new Date().toISOString() }).eq("owner", owner.data).eq("id", event.id);
      if (!write.error) delivered++;
    } catch {
      // The lease delays the next retry and the stable delivery ID supports receiver deduplication.
    }
  }));
  return Response.json({ claimed: result.data.length, delivered });
}
