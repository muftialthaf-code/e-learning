"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { companionScopes, digest } from "../../../lib/learning/companion";
import { admin, learner } from "../../../lib/learning/server";

export type CredentialResult = { token?: string; error?: string };

export async function issueCredential(_previous: CredentialResult, form: FormData): Promise<CredentialResult> {
  const account = await learner();
  if (!account) redirect("/settings");
  const db = admin();
  if (!db) return { error: "The companion API needs server configuration." };
  const values = z.object({
    label: z.string().trim().min(1).max(80),
    scopes: z.array(z.enum(companionScopes)).min(1).max(companionScopes.length),
  }).safeParse({ label: form.get("label"), scopes: form.getAll("scope") });
  if (!values.success) return { error: "Enter a label and select permissions." };
  const token = `ale_${randomBytes(32).toString("base64url")}`;
  const { error } = await db.from("companion_connections").insert({
    owner: account.owner,
    label: values.data.label,
    scopes: [...new Set(values.data.scopes)],
    digest: digest(token),
    expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
  });
  if (error) return { error: "The credential could not be issued." };
  revalidatePath("/settings/companion");
  return { token };
}

export async function revokeCredential(form: FormData) {
  const account = await learner();
  if (!account) redirect("/settings");
  const id = z.uuid().safeParse(form.get("id"));
  const db = admin();
  if (!id.success || !db) redirect("/settings/companion?error=revoke");
  const { error } = await db.from("companion_connections").update({ revoked_at: new Date().toISOString() }).eq("owner", account.owner).eq("id", id.data);
  redirect(error ? "/settings/companion?error=revoke" : "/settings/companion");
}
