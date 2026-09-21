# G12 News

**Pakistan, As It Happens** — a fully AI-automated Pakistani news portal. Stories are pulled from RSS feeds, then categorized, rewritten and scored for urgency by an AI model. Nobody writes articles by hand.

> **Status:** the workspace, database schema, brand theme, placeholder layout, the **automated ingestion pipeline** the **live breaking-news system**, the homepage, the **category pages** and the **article pages** are built. The pipeline runs on a **free** AI (Groq) or on Claude (paid). Search, the static pages and the admin area are later steps.

## Structure

```
apps/
  web/        Next.js 16 (App Router, TypeScript, Tailwind CSS 3) — the public site
    src/components/breaking/   ticker, homepage block, badge, live provider
    src/lib/breaking/          queries, live-stream broker, browser client, state
    src/app/api/breaking*/     /api/breaking (JSON) and /api/breaking-stream (SSE)
    src/app/category/[slug]/   the nine category pages
    src/components/category/   their header, filter bar, grid, pager, sidebar, empty states
    src/lib/category/          cursor paging, URL parsing, queries, tag ranking, SEO metadata
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

Open <http://localhost:3000>. Design and test at a 375px-wide viewport first — most readers are on phones.

## Homepage

Top to bottom: date and social bar, breaking ticker, header (logo, category navigation, search overlay), hero (the most recent high-urgency story large, three more beside it), the breaking block, one section per category (Pakistan, World, Sports, Business, Showbiz, Technology, Health; 4–6 cards each, "View all" links to the category page), a "Trending Now" list of the 5 most-viewed stories of the last 24 hours, and the footer.

- **Rendering:** static with incremental regeneration every 60 seconds (`export const revalidate = 60`). A story the pipeline stores appears within about a minute. If a regeneration hits a database error, Next.js keeps serving the last good page; the data loaders in `src/lib/home/queries.ts` deliberately throw instead of returning an empty page.
- **No layout shift:** the ticker is always 36px tall (a neutral strip when nothing is breaking) and the breaking block always has the same height, so live updates never move the page.
- **Images:** every story picture goes through `next/image`. The hosts Next.js may optimize are listed in `apps/web/image-hosts.json`; a picture from any other host is shown unoptimized, so the optimizer can never be used as an open proxy. A story with no picture, or one that fails to load, shows the G12 News logo card. Feed image URLs are cleaned by `normalizeImageUrl` in `@g12/config` (https, BBC size, Geo News path), by the worker when it stores a story and again by the site when it shows one.
- **Social links:** set `NEXT_PUBLIC_FACEBOOK_URL`, `NEXT_PUBLIC_X_URL` and `NEXT_PUBLIC_WHATSAPP_URL` in `.env`; until then each icon links to that network's home page.
- **Not built yet:** search results, and the About / Contact / Privacy / Disclaimer pages; their links show the 404 page for now.

## Breaking news

**What counts as breaking.** A story is breaking when its `isBreaking` flag is set **and** it was published in the last **6 hours**. The pipeline sets the flag when the urgency score is 7 or higher (a story older than 6 hours can never score above 5, so it is never flagged); a manual admin override (a later step) will flip the same flag regardless of score. The 6-hour limit is applied when reading, so stories drop off on their own. The rule lives in `packages/config/src/breaking.ts`.

**Where it shows**
- **Top bar ticker** on every page: a slim red bar above the header with a pulsing BREAKING badge and a scrolling marquee of the 5 latest breaking headlines, each linking to its article. It pauses on hover, keyboard focus and touch (staying paused about 3 seconds after a finger lifts), and with "reduce motion" it does not scroll at all. It is hidden when nothing is breaking, so the red keeps its meaning.
- **Homepage block:** the latest 4 breaking stories as cards with a red top border, a BREAKING badge and a live timestamp ("12 minutes ago"). In `page.tsx` it sits at the top today; the hero (a later step) goes above it.
- **Lists:** `ArticleCard` already shows the badge on a breaking story, so the homepage sections and the category pages get it for free. A category page's header also shows a live BREAKING badge while that category has a breaking story. For any other list (search, say), use `<BreakingBadge />` and `breakingCardClass(isBreaking)` from `components/breaking/breaking-badge.tsx`, with `isCurrentlyBreaking()` from `@g12/config` to decide.

**Live updates without a refresh.** The approach is **Server-Sent Events fed by a Postgres trigger, with automatic polling as the fallback**:

1. A database trigger (`packages/db/prisma/migrations/*_breaking_notify`) sends a Postgres `NOTIFY` whenever an article becomes, or stops being, a published breaking story. It is in the database rather than the worker, so it also covers the future admin override and any other writer.
2. The web server keeps **one** `LISTEN` connection (however many readers there are) and fans each notification out to every open browser through `/api/breaking-stream`. New stories reach an open page in well under a second.
3. The browser runs one connection for the whole site (ticker and homepage block share it). If the stream can't be used (no `EventSource`, repeated failures, silence for 70 s, or the server can't reach its database), it switches to polling `/api/breaking` every 30 seconds, and retries the stream after 5 minutes. A slow 2-minute reconcile poll also runs while streaming, and a phone that wakes from sleep re-syncs immediately.

Run `npm run db:deploy` after pulling this change: it installs the trigger. If the database is down, pages still render (just without the ticker), `/api/breaking` answers 503 and open streams say "not live" until the database returns, then recover on their own.

**Hosting note.** SSE needs a long-lived connection, so it suits a normal Node server (VPS, container). Serverless hosts cap connection time: the stream then reconnects periodically (and holds one database connection per running instance), and polling covers any gaps.

**Not built yet.** The admin override. (Article links point to `/article/<slug>`; see *Article pages* below.)

## Category pages

`/category/<slug>` for the nine categories: `pakistan`, `world`, `politics`, `business`, `sports`, `showbiz`, `technology`, `health` and `miscellaneous`. The slugs come from `packages/config/src/categories.ts`. `/category/misc` redirects (308) to `/category/miscellaneous`; any other slug is a real 404.

**On each page:** a header (name, a one-line description, and a live BREAKING badge while the category has a breaking story), a "Home / Sports" breadcrumb, a filter bar, 12 stories per page in the homepage's `ArticleCard`, and a sidebar with the five most-viewed stories sitewide (the homepage's *Trending Now* component) and links to the other eight categories. The sidebar sits below the stories on phones. A category with no published stories shows a plain "No stories yet" panel instead of a grid.

**Pagination is cursor-based**, with "Newer / Older stories" links (not infinite scroll). Each link carries the position of the story at the edge of the page (`?after=<time>.<id>` or `?before=…`), so a page never skips or repeats a story when new ones are published meanwhile, which page numbers would. The cursor lives in the URL, so the Back button, sharing and no-JavaScript readers all work, and every page is server-rendered. A stale or hand-edited cursor is ignored, and a cursor that turns out to lead to the first page redirects to the plain URL. The logic is in `src/lib/category/paging.ts`.

**Filters live in the URL too:** `?tag=cricket` and `?sort=viewed` (they combine, and changing either starts again from page 1). The topic chips are the tags that recur (at least twice) in the category's newest 300 stories, top 10, cached for a minute. *Most viewed* orders by `viewCount`, then recency; the article page increments `viewCount` (see *Article pages*), so stories with no readers yet tie and fall back to recency.

**SEO:** each page has its own title (`Sports News: Latest Headlines | G12 News`), meta description, canonical URL and Open Graph / Twitter tags (the site-wide image from `app/opengraph-image.jpg`). Filtered, re-sorted and later pages all name the plain `/category/<slug>` as canonical. Canonical links must be absolute, so **set `SITE_URL` in `.env`** in production; without it they say `http://localhost:3000`. A sitemap and structured data are a later step.

**Rendering:** the pages read their query string, so they are rendered on each request (`loading.tsx` shows a skeleton at once). If the database errors the error page appears, never a false "no stories yet"; with no `DATABASE_URL` at all (local UI work) they show the empty state.

## Article pages

`/article/<slug>`: one published story. Run **`npm run db:deploy`** after pulling this change: it adds two nullable columns to `Article` (`imageCredit`, `correctedAt`; existing rows are untouched). Until it has run, the article page errors, because it reads those columns; the homepage and category pages are unaffected.

**On the page, top to bottom:** breadcrumb; category badge (links to the category) and a BREAKING badge while the story is breaking; the headline; the byline **"By G12 News Desk"** with an *AI-generated* chip; the published time (Pakistan time, plus "32 minutes ago") and, if the story was ever corrected, an "Updated" time; a plain notice that an AI wrote the story from the named outlet's reporting and no human reporter did; the picture with its "Photo: …" credit when the feed gave one; the AI summary as short paragraphs; the **source box** ("Originally reported by Dawn" and a button to the original, in a new tab with `rel="nofollow noopener noreferrer"`); tag chips; share buttons (**WhatsApp, Facebook, X**, in that order); the sitewide disclaimer; and **Related stories** (the 4 newest other stories in the category, using the homepage card; the section is left out when there are none).

- **No comments.** There is no comment box or form of any kind, since nobody moderates the site. A like/reaction counter would be the safe way to add reader interaction later.
- **Byline.** Every story is AI-generated, so the byline is always "G12 News Desk"; no reporter name is ever invented, and the AI notice sits in the header, not in a footer.
- **Views.** `viewCount` is incremented on the server as the page is served, after the response has gone out (`after()`), as one atomic `SET viewCount = viewCount + 1`, so it costs the reader nothing and a counter failure cannot break the page. It feeds *Trending Now* and the category *Most viewed* sort. Only real readers count (`src/lib/article/traffic.ts`): link-preview fetchers (WhatsApp, Facebook, X, Telegram…), crawlers, monitors, scripts, and browser or Next.js prefetches are served the page but not counted. Reloading counts again; there is no per-reader de-duplication.
- **Updated time.** `correctedAt` is set by whatever corrects or re-categorizes a story (the admin panel, a later step; nothing sets it yet, so no story shows "Updated" today). It is deliberately not Prisma's `@updatedAt`, which every view would bump. A change under a minute after publication is not shown.
- **Tag chips** open the story's category with that tag as the topic filter (`/category/sports?tag=cricket`), the same view the category page's own topic chips give. A sitewide tag page could replace this later.
- **404s.** An unknown, malformed, draft or rejected slug gets a real HTTP 404 with a friendly page (`app/article/[slug]/not-found.tsx`) and `noindex`, and a slug that cannot be one of ours (anything but lowercase letters, digits and single hyphens) is refused without a database read. The page has no `loading.tsx` on purpose: streaming would send a 200 before the story is looked up. A database error shows the error page, never a false 404. **Known limit:** a URL with a broken percent-escape (`/article/%E0%A4%A`) is answered `500` by `next start` before any of our code runs (`next dev` says 400). This affects every dynamic route in Next.js 16.3.5, not just this one.
- **Share previews.** Open Graph and Twitter Card tags carry the story's title, excerpt and picture (`src/lib/article/metadata.ts`); a story with no picture is shared with the site's default image (`app/opengraph-image.jpg`). Share links are plain links to each network, with the absolute address built from `SITE_URL` (**set it in `.env`**; without it they say `http://localhost:3000`). Full structured data (JSON-LD) is a later step.
- **Reading progress.** A thin bar under the ticker fills as the story is read (`components/article/reading-progress.tsx`); it needs JavaScript and is hidden from screen readers.
- **Paragraphs.** The AI is asked for "plain paragraphs" but does not always break them, so `src/lib/article/paragraphs.ts` keeps its line breaks and cuts any paragraph over about 90 words into chunks of about 55 at sentence ends (not after "Dr.", "Rs.", "U.S." or an initial). The words are never changed.

## Free AI with Groq

Every hosted AI needs an API key; Groq's is free, needs no credit card, and takes a minute:

1. Sign up at <https://console.groq.com> and open **API Keys** → **Create API Key**.
2. Put it in `.env` as `GROQ_API_KEY=...`. If it is the only AI key set, the worker uses Groq automatically (or set `AI_PROVIDER=groq`).

**What you get.** The worker uses `openai/gpt-oss-120b` first and falls back to `openai/gpt-oss-20b`. On Groq's free plan each model has its own small budget (at the time of writing: 30 requests and 8,000 tokens per minute, 1,000 requests and 200,000 tokens per day; check the [current limits](https://console.groq.com/docs/rate-limits), they can change). A story costs roughly 2,500 tokens, so the two models together cover **about 150–170 stories a day, well under half of what the 33 feeds produce**. Add more models from your Groq console's limits page to `GROQ_MODELS` to raise that.

**How the pipeline copes with such a small budget**
- **Gentler defaults** when Groq is the provider: a pass every 30 minutes, at most 5 new stories per pass (`INGEST_MAX_ITEMS_PER_RUN`), at most 3 per source. The per-pass limit is spread across sources, freshest first, so one busy outlet can't use the whole budget.
- **Model fallback and pacing:** a rate-limited model is skipped for a while; requests are sent one at a time and slowed from Groq's rate-limit headers.
- **Graceful stop:** when both models have spent their daily budget the run says so, defers the remaining stories to the next run (nothing is lost or half-saved) and records it in `IngestLog`.

**Quality.** Free open models are more likely than Claude to invent details, especially from feeds that give only a headline and a sentence (ARY, BBC, Cricinfo, and the one-sentence feeds of Geo, The News and The Nation). The code checks catch copied text, wrong lengths and invalid categories with any model, but **they cannot detect a made-up fact**. Read what `npm run ingest:sample` produces before trusting it, and use Claude (`ANTHROPIC_API_KEY`) if accuracy matters more than cost.

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

- Every article stores `sourceName` and `sourceUrl`. The article page always shows an "Originally reported by [Outlet]" box straight after the story, with a link out that uses `SOURCE_LINK_REL` (`nofollow noopener noreferrer`, new tab) from `@g12/config`.
- The worker also keeps the image credit the feed gave for a story's picture (Media RSS `media:credit` / `media:copyright`) in `imageCredit`; the article page shows it under the picture as "Photo: …", and shows no credit line when the feed named nobody.
- The AI is told, as a required rule, to write in its own words and to use only facts in the item. The code then **enforces** the first part: a brief that reuses a run of 8+ identical words from the source, or is outside the length limits, or has a headline identical to the source's, is sent back once for a rewrite and otherwise not published.
- Only a headline and the feed's own description ever go to the AI. Nothing but the AI brief is stored; the outlet's text is not kept.
- `DISCLAIMER` in `@g12/config` is shown in the footer and at the end of every article: *"G12 News is an automated aggregator. Stories are AI-summarized from the original outlets linked in each article."*
- Feed text is untrusted: it is escaped before it goes into the prompt, and the AI is told to ignore instructions inside it.

### Tuning (all optional, in `.env`)

`AI_PROVIDER`, `GROQ_MODELS`, `AI_MODEL`, `INGEST_INTERVAL_MINUTES` (10, 12, 15, 20, 30 or 60), `INGEST_MAX_ITEMS_PER_RUN`, `INGEST_MAX_ITEMS_PER_SOURCE`, `INGEST_MAX_ITEM_AGE_HOURS`, `INGEST_AI_CONCURRENCY`, `DATABASE_POOL_MAX`. See `.env.example`.

### Cost

Groq's free plan costs nothing. With Claude, every new item is one call of roughly 2,000 tokens in and 600 out. About 300–400 items a day were fresh across the first 29 starter feeds (the four added since, above all The Nation, add more), which comes to roughly:

| Claude model (`AI_MODEL`) | Per day (estimate) |
| --- | --- |
| `claude-opus-5` (default) | $6–10 |
| `claude-sonnet-5` | $2–4 |
| `claude-haiku-4-5` | $1–2 |

These are estimates, not measurements. `ingest:once` prints the real token usage so you can calibrate after the first pass.

### Feeds

The 33 starter feeds cover all nine categories. Twenty-nine were fetched and parsed on 2026-09-20 and had an item under 48 hours old; four were added on 2026-09-21 after being run through the worker's own parser (**The Express Tribune "Latest"**, **The Nation**, **The News "World"**, **Geo News "World"**). Not included, and why: **Samaa TV** (no RSS feed found), **Al Jazeera** (the site resets connections from the development machine, so it could not be verified), **Reuters** (public RSS discontinued), **AP** (blocks feed requests), **Geo Urdu** and **Dunya** (serve HTML, not RSS), dedicated Politics, Analysis and Cricket feeds (Tribune's and The News's are weeks or months stale; a feed that parses is not necessarily a live one, so check the newest item's age) — political stories arrive through the general feeds and are filed as Politics by the AI. The Urdu feeds UrduPoint and Qaumi Awaz were checked and left out: the site is English-only, and UrduPoint's items carry no text beyond the headline. BBC, The Guardian and France 24 stand in for the wire services. Dawn, Business Recorder and the Express Tribune put (nearly) the full article text in their feeds; Geo, The News and The Nation give one sentence, and ARY, BBC and Cricinfo a headline and a sentence, so briefs from those are necessarily short. The four Tribune section feeds (Pakistan, Business, Life & Style, Technology) were 16 to 26 hours stale when checked, so "Latest" carries Tribune's current stories. Tribune's pictures come in a non-standard `<image><img/></image>` block, which the parser reads.

## Scripts (run from the repo root)

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server (`apps/web`) |
| `npm run dev:worker` | Worker with file watching (`apps/worker`) |
| `npm run build` / `npm start` | Production build / serve of the web app |
| `npm run start:worker` | The worker without file watching (runs through `tsx`, also in production) |
| `npm run ingest:dry` / `ingest:sample` / `ingest:once` | Manual ingestion passes (see above) |
| `npm run seed` | Verify and insert the starter sources |
| `npm test` | Run all test suites (config, web, worker; none need a database, network or API key) |
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

- **Logo** (`apps/web/public/brand/`): the supplied G12 News artwork, used unchanged everywhere. Master files, kept for future use: `g12-news-logo.svg` (the supplied SVG) and `g12-news-logo.jpg` (the 1254 × 1254 image embedded in it; grey backdrop). `g12-news-logo-white.png` is the same artwork on a true white backdrop: the logo's own pixels are unchanged, only the grey backdrop and its shadow are lifted onto white (`apps/web/scripts/white-backdrop.mjs`). Everything else is generated from those by `npm run brand:build -w @g12/web` (header/footer crop, placeholder card, favicon, home-screen icon, link-preview image). The crop's file name carries a content hash, and `src/lib/brand.generated.ts` records it, so a new logo automatically gets a new URL and no cache serves the old one. To change the logo, replace the two master files and re-run that command. If you ever get the logo with a transparent background (PNG or SVG), it will sit even more cleanly on the white header and footer.
- **Colors** (`apps/web/tailwind.config.ts`): sampled from the logo (`G12 logo.jpg`). `brand` is the logo blue (`#03388E`, with a 50–950 scale); `crimson` is the logo red (`#BE0303`, 50–900); `breaking` is the same red for breaking-news elements. Neutrals: white `canvas`, `surface` (`#F3F4F6`) for panels and the footer, charcoal `ink` for body text, `muted`, `line`. Use the red sparingly so it keeps its impact.
- **Type:** Merriweather (serif) for headlines via `font-serif`; Inter for body and UI via `font-sans`.
- **Light theme only.** There is no dark mode: the page declares `color-scheme: only light`, so browser "auto dark" features leave it alone.
