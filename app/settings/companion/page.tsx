import Link from "next/link";
import { companionScopes } from "../../../lib/learning/companion";
import { admin, learner } from "../../../lib/learning/server";
import { AccountPrompt, Heading } from "../../learning-ui";
import { revokeCredential } from "./actions";
import { IssueForm, TestConsole } from "./forms";

export default async function Companion({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const account = await learner();
  const db = admin();
  const query = await searchParams;
  const connections = account && db ? await db.from("companion_connections")
    .select("id,label,scopes,expires_at,revoked_at").eq("owner", account.owner).order("created_at", { ascending: false }).limit(25) : null;
  const recent = connections?.data?.length && db ? await db.from("companion_audit")
    .select("id,operation,status,happened_at").in("connection_id", connections.data.map(row => row.id))
    .order("happened_at", { ascending: false }).limit(15) : null;
  return <>
    <Link className="text-link" href="/settings">← Settings</Link>
    <Heading title="Learning Companion">Create scoped credentials and test requests from your productivity app.</Heading>
    {!account ? <AccountPrompt /> : !db ? <p role="status">Server configuration is required to connect a companion app.</p> : <>
      <section className="panel"><h2>Connections</h2>
        {(connections?.error || query.error) && <p role="alert">Connection information could not be updated or loaded.</p>}
        <IssueForm scopes={companionScopes} />
        <ul className="records">{connections?.data?.map(row => <li key={row.id}>
          <strong>{row.label}</strong><small>{row.scopes.join(", ")} · {row.revoked_at ? "Revoked" : Date.parse(row.expires_at) <= new Date().getTime() ? "Expired" : `Expires ${row.expires_at.slice(0, 10)}`}</small>
          {!row.revoked_at && <form action={revokeCredential}><input name="id" type="hidden" value={row.id} /><button className="text-link">Revoke</button></form>}
        </li>)}</ul>
      </section>
      <section className="panel list-panel"><h2>Test a request</h2><TestConsole /></section>
      <section className="panel list-panel"><h2>Recent requests</h2>
        {recent?.error && <p role="alert">Request history could not be loaded.</p>}
        {recent?.data?.length ? <ul className="records">{recent.data.map(row => <li key={row.id}>{row.operation} · HTTP {row.status}<small>{row.happened_at}</small></li>)}</ul> : <p>Requests from authenticated connections will appear here.</p>}
      </section>
    </>}
  </>;
}
