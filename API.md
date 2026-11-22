# API

`GET /api/health` returns HTTP 200 and process liveness JSON. Supabase browser sessions use server actions and cookies. External requests use separate scoped bearer credentials.

## Companion API

All paths below use the prefix `/api/v1/integration`. Write requests use JSON with a maximum 8 KiB body. Quiz attempt, activity and context requests require a UUID `Idempotency-Key`.

| Method and path | Scope | Contract |
| --- | --- | --- |
| GET `/recommendations` | recommendations:read | Returns recently approved source links in `recommendations`. |
| GET `/daily-learning` | recommendations:read | Returns an `action` for the earliest due review or a recent unassessed lesson. |
| GET `/revision-due` | revision:read | Returns due concept IDs, scores, lesson IDs and dates in `reviews`. |
| POST `/quizzes` | quizzes:write | Accepts `{lessonId}`, returns `quizId`, `expiresAt` and questions with options. |
| POST `/quizzes/{quizId}/attempts` | quizzes:write | Accepts `{answers}`, an array of zero-based choice indices, and returns `{score}` between 0 and 1. |
| POST `/activity` | activity:write | Stores `{lessonId, minutes}` from the adapter and returns `{eventId}`. |
| GET `/progress` | progress:read | Returns recent lessons in `recentLessons`. |
| POST `/context` | context:write | Stores explicitly supplied `{topics}` and returns `{eventId}`. |

Credentials identify the learner. Error responses contain an `error` field. Expect 401 for invalid credentials, 403 for missing scope, 409 for an idempotency conflict, 410 for an expired quiz with no prior matching result, 429 with `Retry-After` after 60 calls in a minute, and 503 when storage is unavailable.

External activity and context are retained as separate events. Assessment submissions update the learner’s shared mastery and revision schedule. See [webhook configuration](INTEGRATION.md).
