"use server";

import { redirect } from "next/navigation";
import { supabase } from "../lib/supabase";

export async function signIn(form: FormData) {
  const client = await supabase(true);
  if (!client) redirect("/settings");
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) redirect("/settings?status=signin");
  const membership = await client.rpc("is_learning_member");
  if (membership.data !== true) {
    await client.auth.signOut({ scope: "local" });
    redirect("/settings?status=access");
  }
  redirect("/settings");
}

export async function signOut() {
  const client = await supabase(true);
  const result = await client?.auth.signOut({ scope: "local" });
  redirect(result?.error ? "/settings?status=signout" : "/settings");
}

export async function saveProfile(form: FormData) {
  const client = await supabase(true);
  if (!client) redirect("/settings");
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/settings?status=signin");
  if ((await client.rpc("is_learning_member")).data !== true) redirect("/settings?status=access");

  const displayName = String(form.get("displayName") ?? "").trim();
  const minutes = Number(form.get("minutes"));
  const difficulty = String(form.get("difficulty") ?? "intermediate");
  const spacing = Number(form.get("spacing"));
  const interests = String(form.get("interests") ?? "").trim();
  if (!["introductory", "intermediate", "advanced"].includes(difficulty)
      || !Number.isInteger(spacing) || spacing < 1 || spacing > 14 || interests.length > 240) {
    redirect("/settings?status=invalid");
  }
  if (!displayName || displayName.length > 80 || !Number.isInteger(minutes) || minutes < 5 || minutes > 15) {
    redirect("/settings?status=invalid");
  }
  const { error } = await client.from("profiles").upsert({
    id: user.id,
    display_name: displayName,
    lesson_minutes: minutes,
    difficulty,
    revision_spacing_days: spacing,
    show_reminders: form.get("reminders") === "on",
    interests,
  });
  redirect(error ? "/settings?status=save" : "/settings?status=saved");
}
