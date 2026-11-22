# Learning Companion

The productivity app checkout is unavailable. Its adapter should call the Learning Engine from its backend and use the API as its data contract. With a shared Supabase project, the apps can share an Auth directory while Learning Engine data resides in a dedicated schema.

1. Sign into Learning Engine and open Settings → Learning Companion.
2. Create a named credential with the permissions the adapter requires. Store the returned bearer credential securely. It expires in seven days and can be revoked immediately from the same page.
3. Use the console and a separate test Supabase project for write tests. The console submits real API requests to its current deployment. The automated suite exercises denied credentials, scopes, rate limits, transient backend failures, and quiz submission without a live account.
4. Use the [API contract](API.md) for the adapter. Retry idempotent writes using the original UUID. Respect HTTP 429 and `Retry-After`.

## Optional webhook delivery

Set the exact HTTPS receiver URL, owner UUID, signing secret, and worker token in server settings. Schedule `POST /api/internal/webhooks` with the worker bearer token to deliver pending, owner-scoped assessment events. The worker leases ten per call and makes up to five attempts with exponential delays. Inspect undelivered rows with `tries = 5` after failures.

Verify the lowercase hex HMAC-SHA256 of `<X-Learning-Timestamp>.<raw body>` against `X-Learning-Signature` using a constant-time comparison. Validate timestamp freshness and persist the event ID from `X-Learning-Delivery` before applying side effects. Return a successful status for an already-processed delivery to stop retries.

The Learning Engine can be used with zero companion credentials and without a configured webhook receiver.
