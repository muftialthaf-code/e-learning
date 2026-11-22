import { createClient } from "@supabase/supabase-js";
import { learningSchema, supabase } from "../supabase";

export async function learner() {
  const client = await supabase();
  if (!client) return null;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const membership = await client.rpc("is_learning_member");
  return membership.data === true ? { client, owner: user.id } : null;
}

export function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { db: { schema: learningSchema }, auth: { persistSession: false, autoRefreshToken: false } });
}
