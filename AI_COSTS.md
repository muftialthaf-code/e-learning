# AI costs

Lesson generation and written feedback share a provider interface and monthly budget. The current adapter calls OpenAI Chat Completions with bounded completion tokens and validates the returned JSON against the lesson schema.

Set the model and its current input and output prices in USD per million tokens. The application converts these to integer microdollars. A transactional monthly check (UTC) compares the learner’s budget against settled costs and outstanding reservations before issuing a call. The estimate uses a conservative input bound and the requested output ceiling. Price accuracy depends on the operator’s configuration and the provider’s billing contract.

Validated lessons persist under an owner-scoped key derived from model, topic, duration and source metadata. Reopening a lesson uses the stored body. Identical assignment responses reuse their saved AI feedback. Concurrent requests with the same key share a reservation. A completed provider response settles against returned token usage when available. A definitive rejection releases the reservation. A timeout or ambiguous provider failure retains it to avoid untracked spend. Reconcile retained reservations against the provider’s usage records before releasing them administratively.

Settings shows the monthly limit, settled spend, outstanding reservations and remaining budget. The sample lesson and automated tests generate no paid API calls.
