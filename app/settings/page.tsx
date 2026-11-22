import Link from "next/link";
import { Suspense } from "react";
import Loading from "../loading-state";
import { saveProfile, signIn, signOut } from "../actions";
import { saveBudget } from "../learning-actions";
import { supabase } from "../../lib/supabase";

const messages: Record<string, string> = {
  access: "This account needs access to AI Learning Engine. Contact the project administrator.",
  signin: "Sign-in failed. Check your email and password.",
  signout: "Sign-out failed. Try again.",
  invalid: "Check the display name, lesson duration, and revision interval.",
  save: "The profile could not be saved. Try again.",
  saved: "Preferences saved.",
  "budget-invalid": "Enter a USD amount from 0 to 100 with up to two decimal places.",
  "budget-saved": "Monthly AI budget saved.",
  "budget-error": "The AI budget could not be saved.",
};

export default async function SettingsPage({ searchParams }: {
  searchParams: Promise<{ status?: string }>;
}) {
  return <>
    <header className="page-header"><h1>Settings</h1><p>Manage your account and learning preferences.</p></header>
    <Suspense fallback={<Loading />}><Settings status={(await searchParams).status} /></Suspense>
  </>;
}

async function Settings({ status }: { status?: string }) {
  const client = await supabase();
  if (!client) return <section className="panel"><h2>Account setup</h2><p>Sign-in is unavailable until Supabase is configured.</p></section>;

  const { data: { user: account } } = await client.auth.getUser();
  const membership = account ? await client.rpc("is_learning_member") : null;
  const user = membership?.data === true ? account : null;
  const message = status && Object.hasOwn(messages, status) ? messages[status] : null;
  const profile = user
    ? await client.from("profiles").select("display_name,lesson_minutes,difficulty,revision_spacing_days,show_reminders,interests").eq("id", user.id).maybeSingle()
    : null;

  return <section className="panel">
    <h2>{user ? "Learning preferences" : "Sign in"}</h2>
    {message && <p role={status === "saved" || status === "budget-saved" ? "status" : "alert"}>{message}</p>}
    {user ? <>
      {profile?.error
        ? <p role="alert">Preferences could not be loaded. Reload to try again.</p>
        : <form action={saveProfile}>
          <label>Display name<input name="displayName" defaultValue={profile?.data?.display_name} maxLength={80} required /></label>
          <label>Quick lesson length (minutes)<input name="minutes" defaultValue={profile?.data?.lesson_minutes ?? 10} type="number" min={5} max={15} required /></label>
          <label>Difficulty<select name="difficulty" defaultValue={profile?.data?.difficulty ?? "intermediate"}>
            <option value="introductory">Introductory</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
          </select></label>
          <label>Topics you’re interested in<input name="interests" defaultValue={profile?.data?.interests} maxLength={240} placeholder="Separate topics with commas" /></label>
          <label>Base spacing after a successful review (days)<input name="spacing" type="number" min={1} max={14} defaultValue={profile?.data?.revision_spacing_days ?? 3} required /></label>
          <label className="check"><input name="reminders" type="checkbox" defaultChecked={profile?.data?.show_reminders ?? true} /> Show revision reminders on My Learning</label>
          <button className="button">Save preferences</button>
        </form>}
      <Budget />
      <p><Link className="text-link" href="/settings/companion">Manage Learning Companion →</Link></p>
      <form action={signOut}><button className="text-link">Sign out</button></form>
    </> : <form action={signIn}>
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      <button className="button">Sign in</button>
    </form>}
  </section>;
}

async function Budget() {
  const client = await supabase();
  if (!client) return null;
  const date = new Date();
  const month = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
  const [limit, usage] = await Promise.all([
    client.from("ai_budgets").select("monthly_micros").maybeSingle(),
    client.from("ai_usage").select("amount,state").gte("created_at", month),
  ]);
  const costs = usage.data?.reduce((totals, item) => {
    if (item.state === "settled") totals.settled += Number(item.amount);
    if (item.state === "reserved") totals.reserved += Number(item.amount);
    return totals;
  }, { settled: 0, reserved: 0 });
  const dollars = (micros: number) => new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 6,
  }).format(micros / 1_000_000);
  return <section className="list-panel">
    <h2>AI spending</h2>
    {(limit.error || usage.error) && <p role="alert">Some usage information could not be loaded.</p>}
    {costs && <p>This month (UTC) · {dollars(costs.settled)} settled · {dollars(costs.reserved)} reserved · {dollars(Math.max(0, Number(limit.data?.monthly_micros ?? 0) - costs.settled - costs.reserved))} remaining</p>}
    <form action={saveBudget}>
      <label>Monthly limit (USD)<input name="budget" type="number" min={0} max={100} step="0.01" required defaultValue={Number(limit.data?.monthly_micros ?? 0) / 1_000_000} /></label>
      <button className="button">Save budget</button>
    </form>
  </section>;
}
