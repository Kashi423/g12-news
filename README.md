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

**SEO:** each page has its own title (`Sports News: Latest Headlines | G12 News`), meta description, canonical URL and Open Graph / Twitter tags (the site-wide image from `app/opengraph-image.jpg`). Filtered, re-sorted and later pages all name the plain `/category/<slug>` as canonical. Canonical links must be absolute, so **set `SITE_URL` in `.env`** in production; without it they say `http://localhost:3000`. The sitemap and structured data are described under *SEO, sharing and performance*.

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
- **Share previews.** Open Graph and Twitter Card tags carry the story's title, excerpt and picture (`src/lib/article/metadata.ts`); each story is shared with its own 1200 x 630 JPEG, `/article/<slug>/share.jpg`, and a story with no picture with the site's default image (`app/opengraph-image.jpg`). Share links are plain links to each network, with the absolute address built from `SITE_URL` (**set it in `.env`**; without it they say `http://localhost:3000`). Structured data and the share image are described under *SEO, sharing and performance*.
- **Reading progress.** A thin bar under the ticker fills as the story is read (`components/article/reading-progress.tsx`); it needs JavaScript and is hidden from screen readers.
- **Paragraphs.** The AI is asked for "plain paragraphs" but does not always break them, so `src/lib/article/paragraphs.ts` keeps its line breaks and cuts any paragraph over about 90 words into chunks of about 55 at sentence ends (not after "Dr.", "Rs.", "U.S." or an initial). The words are never changed.

## Navigation, search and the static pages

**Header.** It sticks under the breaking-news bar while the page scrolls, and turns *compact* (smaller logo, less padding, a shadow) once the reader is past the page's hero: the homepage's top story or an article's picture (anything marked `data-page-hero`), or after 160px of scrolling on pages that have none. Compacting never moves the page: the sticky element is a fixed-height, see-through slot, and only the bar inside it shrinks (`components/layout/sticky-header.tsx`; the rule, with a gap so it cannot flutter at the edge, is in `lib/layout/compact.ts`).

- **Desktop (1024px and wider):** the eight-category nav is always visible, and the category the reader is in is underlined in red, both on its own page and on any story in it (an article tells the nav its category with `<ActiveCategory>`).
- **Phones and tablets:** a hamburger button opens a drawer from the left with all nine categories plus About and Contact. It is the browser's native `<dialog>`, so focus stays inside it, Esc closes it, and it also closes on a tap outside, on any link, after navigating, and if the window grows to desktop width.
- A "Skip to the stories" link appears on the first Tab press.

**Search.** The search icon opens a full-screen overlay (no page load). As the reader types, the query goes to `/api/search` 300 ms after the last keystroke, and up to 20 stories appear with the same card used everywhere else. Enter (or "See all results") goes to `/search?q=...`, a normal server-rendered page for sharing or bookmarking (it is `noindex`).

- **`GET /api/search?q=`** returns `{ query, count, results }`. It uses Postgres full-text search with the `simple` dictionary, so it works the same for English and Urdu: every word must match, each word may be the start of a longer one (so results appear while typing), a match in the title counts most, then tags, excerpt and body, and the order is relevance first, then newest. Only published stories are searched. A missing or too-short query is a `400`, a database failure is a `503` (never a fake "no results"), and results may be cached for 30 seconds on a CDN. Only letters and digits ever reach the database query, so nothing typed can act as a command (`lib/search/query.ts`, tested).
- **Body text is searched too**, not only title, tags and excerpt, so a name mentioned only in the story still finds it. There is no stemming ("kill" does not find "killed").
- **Scale.** The search vector is computed as each query runs, which is fine for thousands of stories. Add a GIN index on the same expression when the table gets much larger. There is no per-visitor rate limit in the app, so set one at your CDN or reverse proxy before a public launch.

**Static pages.** `/about`, `/contact`, `/privacy` and `/disclaimer` are written to describe only what the site really does (an AI-automated aggregator, no cookies, no analytics, no ads, every story linked to its source).

- **Set `CONTACT_EMAIL` in `.env`** and rebuild. The Contact page never makes up an address: until you set one it says the address has not been published yet.
- The privacy policy is a plain-language description of today's behaviour, not legal advice. **Update it before you add analytics or ads** (it says so), and have it reviewed before you apply to an ad network.

## SEO, sharing and performance

**Set `SITE_URL` in `.env` before you deploy** (for example `https://g12news.com`). Every absolute address the site publishes (canonical links, the sitemap, `robots.txt`, structured data, share tags and share links) is built from it. Without it they all say `http://localhost:3000`, and a production process logs a warning saying so. Set it wherever the site is built *and* run.

**Structured data** (JSON-LD; `src/lib/seo/json-ld.ts`, unit-tested):

- **Every page** (from the root layout): an `Organization` (name, address, a 512 x 512 logo from `app/icon.jpg`, `publishingPrinciples` pointing at `/about`) and a `WebSite` with a `SearchAction` pointing at `/search?q={search_term_string}`. `sameAs` (social profiles) and `contactPoint` are included **only if you have set** the real `NEXT_PUBLIC_FACEBOOK_URL` / `NEXT_PUBLIC_X_URL` / `NEXT_PUBLIC_WHATSAPP_URL` and `CONTACT_EMAIL`; nothing is invented.
- **Story pages:** a `NewsArticle` (headline cut to Google's ~110 characters, image, `datePublished`, `dateModified` = the correction time, or the publish time if never corrected, publisher with logo, section, keywords, and `isBasedOn` naming the outlet whose report it summarises) and a `BreadcrumbList` (Home > Category > Story). The **author is the Organization "G12 News", never a person**, because no person wrote it.
- **Category pages:** a `BreadcrumbList` (Home > Category).
- The JSON is made safe to put inside a `<script>` tag: `<` and the two line-separator characters are escaped, so a headline containing `</script>` cannot break out of the tag (tested).
- After deploying, check a story and a category in Google's **Rich Results Test** and at validator.schema.org.

**Sitemap and crawling.**

- **`/sitemap.xml`** (`src/app/sitemap.ts`) is built from the database when it is requested, never a file to maintain: the homepage, all nine categories (last-modified = their newest story), the four static pages, and every **published** story (last-modified = its correction or publish time), newest first. A story is in it the moment it is published and drops out if it is unpublished; drafts and rejected stories never appear, nor `/search` or `/api`. It is deliberately *not* prerendered at build time (a build has neither the deployed `SITE_URL` nor necessarily a database). A shared cache may keep it for 5 minutes. One sitemap file holds 50,000 addresses; this one lists the newest 45,000 stories and logs a warning when there are more (then split it with Next.js `generateSitemaps` and a sitemap index).
- **`/robots.txt`** allows everything and names the sitemap. The only thing it disallows is `/api/` (data endpoints, one of them a live stream). `/search` is *not* blocked: its pages say `noindex` themselves, and a crawler that is blocked cannot see that.
- **Canonical URL** on every page: the root layout sets it to each page's own path; category pages (filtered, sorted, paged) name the plain `/category/<slug>`; search pages name `/search`. A 404 is a real 404 with `noindex`.

**Sharing (WhatsApp, Facebook, X).** Every story's `og:image` is its own **`/article/<slug>/share.jpg`**: the outlet's picture re-made as exactly **1200 x 630**, always a **JPEG**, under 240 KB (`src/lib/seo/share-image.ts`, using `sharp`). The outlet's own picture is a poor share image (some are 600 KB PNGs, some WebP, sizes vary; WhatsApp shows previews reliably only up to roughly 300 KB). Only the hosts already approved for pictures (`apps/web/image-hosts.json`) are ever fetched, over https, with redirects followed only to another approved host and size, time and pixel limits, so this cannot be used to make the server fetch arbitrary addresses (tested: an unapproved address is never contacted). A story with no picture, or one that cannot be fetched, is shared with the site image (`/opengraph-image.jpg`); a failure is remembered for 5 minutes, not longer. The result is cached (`max-age=3600, s-maxage=86400, stale-while-revalidate=604800`).

- The tags: `og:type=article`, `og:title`, `og:description`, `og:url` (= the canonical address), `og:image` with width, height, type and alt, `og:site_name`, `og:locale`, `article:published_time` (and `modified_time` after a correction), section and tags; and a Twitter `summary_large_image` card. The locale is `en_GB` (Facebook's list has no Pakistan English); change `src/lib/seo/locale.ts` if you prefer `en_US`.
- What was checked here: every tag, and the image fetched with WhatsApp, Facebook and X user agents (HTTP 200, `image/jpeg`, 1200 x 630, all under 300 KB). What cannot be checked from `localhost` is the networks' own crawlers: after deploying, send a story link to yourself on WhatsApp, and paste one into the Facebook **Sharing Debugger** and the X / LinkedIn card validators (they keep a preview for days, so re-scrape after any change).

**Performance.** Measured with Lighthouse's mobile preset (a simulated mid-range phone on slow 4G with a 4x slower CPU), against the local production build on a development PC that was also running the worker and database, so treat the numbers as a guide and re-measure the deployed site (PageSpeed Insights):

| Page | Performance | Total blocking time | Layout shift | Notes |
|---|---|---|---|---|
| Homepage | 88 to 92 (was 66) | about 225 ms (was 1131 ms) | 0.000 | LCP about 2.7 to 3.2 s in the simulation; about 1.8 s on a throttled real browser (slow 4G, 4x slower CPU) |
| Category | 80 to 86 | about 275 to 400 ms | 0.000 | |
| Story | 89 to 91 | about 90 to 150 ms | 0.000 | |
| About | 93 | about 165 ms | 0.000 | |

Accessibility, Best Practices and SEO are 100 on these pages (a search-results page scores lower on SEO only because it is deliberately `noindex`). Scores move by several points from run to run.

- **What made the biggest difference:** the header and the reading-progress bar used to ask the browser for an element's position while the page was still loading, which forced a layout in the middle of hydration and delayed the first paint by about 1.8 s. They no longer measure during load (the header measures on scroll and resize, and once after load when the browser itself has scrolled the page, for a reload, the Back button or a `#link`). That alone took the homepage from about 58 to about 88.
- **Pictures:** story pictures are plain `<img>` tags with next/image's own attributes (`getImageProps`: resized, WebP/AVIF, `srcset`), not a hydrated component each, which was the largest JavaScript cost of a page with dozens of stories. One small script (`components/layout/page-enhancements.tsx`) serves them all: it swaps a failed picture for the logo card and keeps every "x minutes ago" current. The top picture of a page (the homepage's lead story, an article's picture, the first card of a category or search page) is `loading="eager"` with `fetchpriority="high"`, which Next.js 16 recommends over `preload`; every other picture is lazy-loaded. Two quality levels (60 for cards, 75 for the top picture) and finer width steps keep them small; optimized copies are kept for a day.
- **Fonts:** `next/font/google` already downloads the fonts at build time and serves them from this site (the browser never contacts Google) and only the Latin subset is loaded up front; the other alphabets are fetched only if a page uses those characters. Merriweather's Latin file is about 96 KB because it is a variable font. Replacing it with a single static weight would roughly halve that, but it changes the look, so it was left as it is.
- **Left as they are:** the "unused JavaScript" and "legacy JavaScript" notes in Lighthouse (about 25 KB and 13 KB) come from Next.js's own framework chunk, and the remaining cost is React hydrating a page of 26 stories. Fewer stories per section would reduce it.

**Caching headers** (they matter once a CDN or reverse proxy is in front; without one they are harmless):

| Path | `Cache-Control` |
|---|---|
| `/` | `s-maxage=60, stale-while-revalidate` (ISR: rebuilt at most once a minute) |
| `/category/*` | `public, max-age=0, s-maxage=60, stale-while-revalidate=300` |
| `/article/*`, `/search` | `private, no-cache`: never kept by a shared cache, because every story visit is a counted view. It is `no-cache`, not `no-store`, so the browser's Back button can restore the page instantly |
| `/api/breaking` | `s-maxage=10, stale-while-revalidate=20` |
| `/api/search` | `s-maxage=30, stale-while-revalidate=60` (a 400 or 503 is `no-store`) |
| `/api/breaking-stream` | a live stream, never cached |
| `/sitemap.xml`, `/robots.txt` | `s-maxage=300`, `s-maxage=3600` |
| `/article/*/share.jpg` | `max-age=3600, s-maxage=86400, stale-while-revalidate=604800` |
| `/icon.jpg`, `/opengraph-image.jpg`, `/brand/*` | one day + revalidate; the content-hashed logo file one year (`immutable`) |
| `/_next/static/*` | one year, `immutable` (Next.js) |
| `/_next/image` | at least one day |

After a deploy, the first request for the homepage (and static pages) is answered from the copy made at build time and starts a fresh one, as ISR always does. Open `/` once (or build with the database reachable) before you submit anything to a search engine.

**Search Console checklist** (after the site is live; the deployment step comes later):

1. Set `SITE_URL` and deploy.
2. Add the site in **Google Search Console** and verify it: either with DNS, or put the meta tag's `content` value in `GOOGLE_SITE_VERIFICATION` in `.env` and redeploy. Do the same in **Bing Webmaster Tools** with `BING_SITE_VERIFICATION`.
3. Submit `https://<your site>/sitemap.xml` in both.
4. Use *URL Inspection* on a story and a category, and the Rich Results Test on a story.
5. Watch *Pages* (indexing) over the following weeks. Expect some "Crawled, currently not indexed" and duplicate warnings: these are AI summaries of other outlets' reporting, and Google decides for itself whether to index them.

**Honest notes.**

- **Google News:** its publisher inclusion asks for original reporting and clear authorship. A site that summarises other outlets' reports with AI is unlikely to qualify, so none of this is built around it (there is no news sitemap either). The sitemap and structured data are for ordinary Google and Bing search.
- The `SearchAction` is valid and harmless, but Google announced in late 2024 that it would stop showing the sitelinks search box, so do not expect one.
- Structured data helps search engines understand a page; it does not make one rank. Nothing on the site claims more than is true (the author is the organisation, the source is named and linked).

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
