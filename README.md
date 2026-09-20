# G12 News

**Pakistan, As It Happens** — a fully AI-automated Pakistani news portal. Stories are pulled from RSS feeds, then categorized, rewritten and scored for urgency by an AI model. Nobody writes articles by hand.

> **Status:** the workspace, database schema, brand theme, placeholder layout and the **automated ingestion pipeline** are built. The pipeline runs on a **free** AI (Groq) or on Claude (paid). The homepage, category pages and article pages are later steps.

## Structure

```
apps/
  web/        Next.js 16 (App Router, TypeScript, Tailwind CSS 3) — the public site
  worker/     Standalone Node.js process — RSS ingestion + AI pipeline
    src/lib/ai.ts          the only file the pipeline uses to reach an AI: prompt + validation
    src/lib/groq-backend.ts        free provider (Groq): model fallback, rate-limit handling
    src/lib/anthropic-backend.ts   paid provider (Claude)
    src/ingest/            fetch, dedupe, pipeline, database store, report
    src/scripts/           ingest-once.ts, seed-sources.ts
    src/scheduler.ts       BullMQ (Redis) or node-cron
packages/
  db/         Prisma schema, migrations and the shared client (PostgreSQL)
  config/     Shared constants: site info + disclaimer, categories, starter RSS sources
```

npm workspaces tie these together from the root `package.json`. The `@g12/db` and `@g12/config` packages ship TypeScript source: Next.js compiles them (`transpilePackages`) and the worker runs them through `tsx`, so there is no separate build step for packages.

## Prerequisites

- **Node.js 20.19+** (22 LTS recommended) and npm 10+
- **PostgreSQL 14+**
- An **AI key**, either **free** (Groq, no card) or paid (Anthropic Claude). See [Free AI with Groq](#free-ai-with-groq).
- **Redis 6.2+** — optional. With it, ingestion is a BullMQ repeatable job; without it the worker schedules itself with node-cron.

The web app's placeholder layout runs without any of the above.

## Setup

```bash
# 1. Install everything (also generates the Prisma client)
npm install

# 2. Create your env file — one .env at the repo root is shared by web, worker and Prisma
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
# then edit .env: DATABASE_URL and GROQ_API_KEY (free) — or ANTHROPIC_API_KEY (paid)

# 3. Start Postgres (and optionally Redis) — or use your own installs
docker run -d --name g12-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=g12news -p 5432:5432 postgres:16
docker run -d --name g12-redis -p 6379:6379 redis:7

# 4. Create the tables, then load the starter RSS sources
npm run db:deploy
npm run seed
```

`npm run seed` fetches every feed in `packages/config/src/sources.ts` first and only marks the ones that respond with fresh, valid RSS as active. It is safe to re-run.

## Run the web app

```bash
npm run dev
```

Open <http://localhost:3000>: the placeholder header (the "G12 News" wordmark in the logo's red and blue, plus the tagline), a placeholder body and the footer with the copyright and the sitewide disclaimer. Design and test at a 375px-wide viewport first — most readers are on phones.

## Free AI with Groq

Every hosted AI needs an API key; Groq's is free, needs no credit card, and takes a minute:

1. Sign up at <https://console.groq.com> and open **API Keys** → **Create API Key**.
2. Put it in `.env` as `GROQ_API_KEY=...`. If it is the only AI key set, the worker uses Groq automatically (or set `AI_PROVIDER=groq`).

**What you get.** The worker uses `openai/gpt-oss-120b` first and falls back to `openai/gpt-oss-20b`. On Groq's free plan each model has its own small budget (at the time of writing: 30 requests and 8,000 tokens per minute, 1,000 requests and 200,000 tokens per day; check the [current limits](https://console.groq.com/docs/rate-limits), they can change). A story costs roughly 2,500 tokens, so the two models together cover **about 150–170 stories a day, roughly half of what the 29 feeds produce**. Add more models from your Groq console's limits page to `GROQ_MODELS` to raise that.

**How the pipeline copes with such a small budget**
- **Gentler defaults** when Groq is the provider: a pass every 30 minutes, at most 5 new stories per pass (`INGEST_MAX_ITEMS_PER_RUN`), at most 3 per source. The per-pass limit is spread across sources, freshest first, so one busy outlet can't use the whole budget.
- **Model fallback and pacing:** a rate-limited model is skipped for a while; requests are sent one at a time and slowed from Groq's rate-limit headers.
- **Graceful stop:** when both models have spent their daily budget the run says so, defers the remaining stories to the next run (nothing is lost or half-saved) and records it in `IngestLog`.

**Quality.** Free open models are more likely than Claude to invent details, especially from feeds that give only a headline and a sentence (Express Tribune, ARY, BBC, Cricinfo). The code checks catch copied text, wrong lengths and invalid categories with any model, but **they cannot detect a made-up fact**. Read what `npm run ingest:sample` produces before trusting it, and use Claude (`ANTHROPIC_API_KEY`) if accuracy matters more than cost.

Not verified against the live Groq service: the request format was built from Groq's documentation and tested against a local stand-in. If the first `ingest:sample` shows errors, the message names the problem; the worker also steps down to simpler request formats automatically if a model rejects one.

## The ingestion pipeline

Each pass does this, per feed and per item:

1. **Fetch** every active source's RSS (`rss-parser`, a browser-compatible User-Agent, 20 s timeout, malformed XML repaired first). A feed that fails is recorded and skipped; it never stops the run. A feed is never fetched more than once every **10 minutes**.
2. **Screen** the items: drop anything older than 24 h, anything already stored (matched by canonical URL: tracking parameters stripped), and near-identical headlines already published. Headlines that are only *similar* to a recent article are shown to the AI, which judges whether it is the same story.
3. **Analyze** each new item with the AI via `lib/ai.ts`: category (one of the fixed nine), 3–6 tags, an original 120–220 word brief, a rewritten headline, an SEO slug and an urgency score 0–10.
4. **Reject** ads, press releases, low-quality items, stories it can't categorize confidently, and (for world feeds) stories that are neither Pakistan-relevant nor major. Rejects are stored with status `REJECTED` so they are never sent to the AI again.
5. **Publish** the rest as `PUBLISHED` articles with `sourceName` and `sourceUrl` kept for attribution. `isBreaking` is set when urgency is 7 or higher.
6. **Log** one `IngestLog` row per source fetched in the pass: items found, published, skipped, and any error.

### Commands

| Command | What it does |
| --- | --- |
| `npm run ingest:dry` | Fetch and screen only: **no AI calls, nothing saved, no API key needed**. Shows what a pass would do. |
| `npm run ingest:sample` | A real pass, capped at 2 new items per source. The cheap way to read the AI's output first. |
| `npm run ingest:once` | One full manual pass with console output of what was fetched, published and skipped. |
| `npm run dev:worker` | The long-running worker: a pass at start-up, then one every 30 minutes (Groq) or 15 minutes (Claude). |
| `npm run seed` | Verify and insert the starter sources. |
| `npm test` | Unit and pipeline tests (no database, network or API key needed). |

Extra flags for `ingest:once` (also accepted by the two shortcuts): `--limit=N`, `--source=dawn`, `--force` (ignore the 10-minute rule), `--dry-run`. They go after `--` — **but PowerShell swallows a bare `--`**, so there write it quoted:

```powershell
npm run ingest:once '--' --source=dawn --limit=3      # PowerShell
npm run ingest:once -- --source=dawn --limit=3        # bash, cmd, zsh
```

### Legal and attribution safeguards

- Every article stores `sourceName` and `sourceUrl`. The article page (a later step) should show "Source: [Outlet] →" using `SOURCE_LINK_REL` (`nofollow noopener`) from `@g12/config`.
- The AI is told, as a required rule, to write in its own words and to use only facts in the item. The code then **enforces** the first part: a brief that reuses a run of 8+ identical words from the source, or is outside the length limits, or has a headline identical to the source's, is sent back once for a rewrite and otherwise not published.
- Only a headline and the feed's own description ever go to the AI. Nothing but the AI brief is stored; the outlet's text is not kept.
- `DISCLAIMER` in `@g12/config` is shown in the footer: *"G12 News is an automated aggregator. Stories are AI-summarized from the original outlets linked in each article."*
- Feed text is untrusted: it is escaped before it goes into the prompt, and the AI is told to ignore instructions inside it.

### Tuning (all optional, in `.env`)

`AI_PROVIDER`, `GROQ_MODELS`, `AI_MODEL`, `INGEST_INTERVAL_MINUTES` (10, 12, 15, 20, 30 or 60), `INGEST_MAX_ITEMS_PER_RUN`, `INGEST_MAX_ITEMS_PER_SOURCE`, `INGEST_MAX_ITEM_AGE_HOURS`, `INGEST_AI_CONCURRENCY`, `DATABASE_POOL_MAX`. See `.env.example`.

### Cost

Groq's free plan costs nothing. With Claude, every new item is one call of roughly 2,000 tokens in and 600 out. About 300–400 items a day are fresh across the 29 starter feeds, which comes to roughly:

| Claude model (`AI_MODEL`) | Per day (estimate) |
| --- | --- |
| `claude-opus-5` (default) | $6–10 |
| `claude-sonnet-5` | $2–4 |
| `claude-haiku-4-5` | $1–2 |

These are estimates, not measurements. `ingest:once` prints the real token usage so you can calibrate after the first pass.

### Feeds

The 29 starter feeds cover all nine categories. Each was fetched and parsed on 2026-09-20 and had an item under 48 hours old. Not included, and why: **Samaa TV** (no RSS feed found), **Al Jazeera** (the site resets connections from the development machine, so it could not be verified), **Reuters** (public RSS discontinued), **AP** (blocks feed requests), **Geo Urdu** and **Dunya** (serve HTML, not RSS), and dedicated Politics feeds (Tribune's and The News's are months stale) — political stories arrive through the general feeds and are filed as Politics by the AI. BBC, The Guardian and France 24 stand in for the wire services. Dawn and Business Recorder put the full article text in their feeds; Express Tribune, ARY, BBC and Cricinfo give only a headline and a sentence, so briefs from those are necessarily short.

## Scripts (run from the repo root)

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server (`apps/web`) |
| `npm run dev:worker` | Worker with file watching (`apps/worker`) |
| `npm run build` / `npm start` | Production build / serve of the web app |
| `npm run start:worker` | The worker without file watching (runs through `tsx`, also in production) |
| `npm run ingest:dry` / `ingest:sample` / `ingest:once` | Manual ingestion passes (see above) |
| `npm run seed` | Verify and insert the starter sources |
| `npm test` | Run the test suites |
| `npm run typecheck` | Type-check every workspace |
| `npm run lint` | ESLint (web) |
| `npm run db:generate` | Regenerate the Prisma client (runs automatically after `npm install`) |
| `npm run db:migrate` | Create/apply a migration after editing `schema.prisma` (dev) |
| `npm run db:deploy` | Apply committed migrations (fresh setup, CI, production) |
| `npm run db:studio` | Prisma Studio, a browser UI for the data |

## Database

The schema is `packages/db/prisma/schema.prisma`: `Source`, `Article`, `IngestLog`, plus the `Category` and `ArticleStatus` enums. It is PostgreSQL-only (it uses enums and `String[]` tags). Import from the shared package in either app:

```ts
import { prisma, Category, ArticleStatus } from "@g12/db";
```

After changing the schema, run `npm run db:migrate` and commit the new folder in `packages/db/prisma/migrations/`. Public pages must only show articles with `status: "PUBLISHED"`.

## Categories and sources

Nine fixed categories — Pakistan, World, Politics, Business, Sports (cricket leads), Showbiz, Technology, Health, Miscellaneous — are defined in `packages/config/src/categories.ts`. The same ids exist as the Prisma `Category` enum; `npm run typecheck` fails if the two drift apart, so change both together. The AI is given these same category descriptions. Starter RSS feeds live in `packages/config/src/sources.ts`; feeds whose category is `WORLD` are treated as international (Pakistan-relevant or major stories only).

## Branding

- **Colors** (`apps/web/tailwind.config.ts`): sampled from the logo (`G12 logo.jpg`). `brand` is the logo blue (`#03388E`, with a 50–950 scale); `crimson` is the logo red (`#BE0303`, 50–900); `breaking` is the same red for breaking-news elements. Neutrals: white `canvas`, `surface` (`#F3F4F6`) for panels and the footer, charcoal `ink` for body text, `muted`, `line`. Use the red sparingly so it keeps its impact.
- **Type:** Merriweather (serif) for headlines via `font-serif`; Inter for body and UI via `font-sans`.
- **Light theme only.** There is no dark mode: the page declares `color-scheme: only light`, so browser "auto dark" features leave it alone.
