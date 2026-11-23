# AI Learning Engine

A personal learning application with short lessons, university-style study plans, and a shared learning profile. It includes source discovery and saving, lesson generation, assessment-based revision, a spending limit, and a versioned companion API.

## Run locally

Use Node.js 24. Run `npm ci` and `npm run dev` from this checkout. The application defaults to port 3000. Quick Learning links to an interactive sample you can use without an account or AI calls.

For real account features, copy `.env.example` to `.env.local` and set the Supabase project URL, publishable key, and server-only service role key. Apply the migrations in `supabase/migrations` in filename order, create your personal account in Supabase Auth, or reuse your existing project login. Follow the [Supabase setup](DATABASE.md#supabase-setup) to expose the learning schema and grant that account access.

- For Discover, configure Firecrawl (`FIRECRAWL_API_KEY`) and/or YouTube Data API credentials. Firecrawl requests up to five web results per search, with page scraping disabled. Library also accepts a manually entered HTTPS course link.
- For lesson generation, configure an OpenAI Chat Completions model supporting JSON responses and set both current token prices. Sign in and set the monthly limit under Settings before generating your first lesson.
- For the productivity app, issue a scoped credential in Settings → Learning Companion. The test console can check the same API used by the adapter. Use a separate Supabase project for connector write tests. The webhook configuration is optional.
- For Railway, link this repository, set the environment variables in Railway, use the build, start, and liveness settings in `railway.json`. Keep the database and Auth credentials in Supabase and server settings. Review the Supabase backup policy before storing irreplaceable material.

Run `npm run lint`, `npm run build`, `npm run typecheck`, and `npm test`. Automated tests run against embedded PostgreSQL and mocked provider or connector contracts with no paid API requests.

[Architecture](ARCHITECTURE.md) · [Milestones](MILESTONES.md) · [API](API.md) · [Companion setup](INTEGRATION.md)
