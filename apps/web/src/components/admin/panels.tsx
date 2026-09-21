import Link from "next/link";
import { BREAKING_MAX_AGE_HOURS, CATEGORIES, CATEGORY_BY_ID, isCurrentlyBreaking, REVIEW_STUCK_AFTER_HOURS, type CategoryId } from "@g12/config";
import { deleteArticleAction, logoutAction, recategorizeAction, republishAction, setBreakingAction, setRequireReviewAction, unpublishAction } from "@/lib/admin/actions";
import { isStale, lastSuccess, type Alert } from "@/lib/admin/alerts";
import { ARTICLES_PER_PAGE, LOG_ROWS, type ArticleFilter, type Stats, type getLogRows, type getSources, type searchArticles } from "@/lib/admin/data";
import { ago, formatPkt } from "@/lib/admin/time";
import { ConfirmSubmit } from "./confirm-submit";
import { FetchNowButton } from "./fetch-now-button";
import { SourceForm } from "./source-form";

/** The dashboard's server-rendered parts. Plain on purpose: this page is for one person, and it should be fast and clear. */

const btn = "border border-line bg-white px-2 py-1 text-xs font-semibold hover:bg-surface disabled:cursor-not-allowed disabled:text-muted";
const th = "border-b border-line px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-muted";
const td = "border-b border-line px-2 py-2 align-top text-sm";

export function AdminHeader({ email }: { email: string }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
      <h1 className="text-xl font-black text-brand">G12 News admin</h1>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted">{email}</span>
        <Link href="/" target="_blank" className="text-brand underline">
          View site
        </Link>
        <form action={logoutAction}>
          <button type="submit" className={btn}>
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}

export function AlertBanners({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="alerts">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          role="alert"
          data-testid={`alert-${alert.id}`}
          className={alert.level === "error" ? "border-l-8 border-crimson-800 bg-crimson px-4 py-3 text-white" : "border-l-8 border-amber-600 bg-amber-100 px-4 py-3 text-amber-950"}
        >
          <p className="font-bold">{alert.level === "error" ? "⚠ " : ""}{alert.title}</p>
          <p className="text-sm">{alert.detail}</p>
          {alert.items.length > 0 ? (
            <ul className="mt-1 list-disc pl-5 text-sm">
              {alert.items.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function ReviewSwitch({ on, pendingCount }: { on: boolean; pendingCount: number }) {
  return (
    <form action={setRequireReviewAction} className={`flex flex-wrap items-center gap-4 border p-3 ${on ? "border-brand bg-brand-50" : "border-line bg-surface"}`} data-testid="review-switch">
      <input type="hidden" name="on" value={String(!on)} />
      <button
        type="submit"
        role="switch"
        aria-checked={on}
        aria-label="Require review before publish"
        className={`relative h-7 w-14 shrink-0 rounded-full border transition-colors ${on ? "border-brand bg-brand" : "border-muted bg-white"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full transition-all ${on ? "left-8 bg-white" : "left-1 bg-muted"}`} />
      </button>
      <div>
        <p className="font-bold">
          Require review before publish: <span data-testid="review-state">{on ? "ON" : "OFF"}</span>
        </p>
        <p className="text-sm text-muted">
          {on
            ? "Every story the AI accepts, breaking news included, waits in Pending review. Nothing goes live until you approve it."
            : pendingCount > 0
              ? `Accepted stories go live immediately. ${pendingCount} story${pendingCount === 1 ? " is" : "ies are"} still waiting from earlier: approve or reject them in Pending review.`
              : "Accepted stories go live immediately."}
          {" "}Takes effect on the very next story the pipeline saves.
        </p>
      </div>
    </form>
  );
}

export function StatsStrip({ stats, pendingCount, overdue, now }: { stats: Stats; pendingCount: number; overdue: boolean; now: Date }) {
  const tile = "flex min-w-0 flex-col gap-0.5 border border-line bg-white p-3";
  return (
    <section aria-label="At a glance" className="grid grid-cols-2 gap-2 lg:grid-cols-5" data-testid="stats">
      <div className={tile}>
        <span className="text-xs font-bold uppercase text-muted">Live articles</span>
        <span className="text-2xl font-black" data-testid="stat-live">{stats.liveTotal.toLocaleString("en")}</span>
        <span className="text-xs text-muted">Newest: {stats.newestLiveAt ? ago(stats.newestLiveAt, now) : "none yet"}</span>
      </div>
      <div className={`${tile} lg:col-span-2`}>
        <span className="text-xs font-bold uppercase text-muted">Published today (Pakistan time)</span>
        <span className="text-2xl font-black" data-testid="stat-today">{stats.publishedToday}</span>
        <span className="text-xs text-muted" data-testid="stat-today-categories">
          {stats.publishedTodayByCategory.length > 0 ? stats.publishedTodayByCategory.map((row) => `${CATEGORY_BY_ID[row.category].name} ${row.count}`).join(" · ") : "Nothing yet today"}
        </span>
      </div>
      <div className={tile}>
        <span className="text-xs font-bold uppercase text-muted">Most viewed today</span>
        {stats.mostViewedToday ? (
          <>
            <Link href={`/article/${stats.mostViewedToday.slug}`} target="_blank" className="line-clamp-2 text-sm font-bold text-brand underline" data-testid="stat-top-title">
              {stats.mostViewedToday.title}
            </Link>
            <span className="text-xs text-muted">{stats.mostViewedToday.views.toLocaleString("en")} views today</span>
          </>
        ) : (
          <span className="text-sm text-muted">No views counted yet today</span>
        )}
      </div>
      <div className={`${tile} ${overdue ? "border-amber-500 bg-amber-50" : ""}`}>
        <span className="text-xs font-bold uppercase text-muted">Pending review</span>
        <span className="text-2xl font-black" data-testid="stat-pending">{pendingCount}</span>
        <span className="text-xs text-muted">{overdue ? `Some are over ${REVIEW_STUCK_AFTER_HOURS} h old` : "Waiting for your decision"}</span>
      </div>
    </section>
  );
}

export const TABS = [
  { id: "pending", label: "Pending review" },
  { id: "health", label: "Pipeline health" },
  { id: "log", label: "Ingestion log" },
  { id: "sources", label: "Sources" },
  { id: "articles", label: "Articles" },
] as const;
export type TabId = (typeof TABS)[number]["id"];

export function TabNav({ current, pendingCount, overdue }: { current: TabId; pendingCount: number; overdue: boolean }) {
  return (
    <nav aria-label="Dashboard sections" className="flex flex-wrap gap-1 border-b-2 border-brand">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={`/admin?tab=${tab.id}`}
          aria-current={current === tab.id ? "page" : undefined}
          data-testid={`tab-${tab.id}`}
          className={`px-3 py-2 text-sm font-bold ${current === tab.id ? "bg-brand text-white" : "bg-surface text-brand hover:bg-brand-50"}`}
        >
          {tab.label}
          {tab.id === "pending" ? (
            <span data-testid="pending-badge" className={`ml-1.5 inline-block min-w-5 px-1.5 text-center text-xs ${pendingCount === 0 ? "bg-white/70 text-muted" : overdue ? "bg-amber-500 text-black" : "bg-crimson text-white"}`}>
              {pendingCount}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

type SourceRows = Awaited<ReturnType<typeof getSources>>;

export function HealthTable({ sources, now }: { sources: SourceRows; now: Date }) {
  const view = sources
    .map((source) => ({ source, stale: isStale(source, now), success: lastSuccess(source) }))
    // Problems first, then A to Z.
    .sort((a, b) => Number(b.stale) - Number(a.stale) || Number(Boolean(b.source.lastError)) - Number(Boolean(a.source.lastError)) || a.source.name.localeCompare(b.source.name));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" data-testid="health-table">
        <thead>
          <tr>
            <th className={th}>Source</th>
            <th className={th}>Last fetched</th>
            <th className={th}>Last success</th>
            <th className={th}>Last error</th>
            <th className={th}>Fetch</th>
          </tr>
        </thead>
        <tbody>
          {view.map(({ source, stale, success }) => (
            <tr key={source.id} data-testid="health-row" data-stale={stale} className={stale ? "bg-crimson-50" : source.isActive ? "" : "bg-surface text-muted"}>
              <td className={td}>
                <span className="font-semibold">{source.name}</span>
                {!source.isActive ? <span className="ml-2 bg-muted px-1.5 py-0.5 text-[11px] font-bold text-white">OFF</span> : null}
                <br />
                <span className="text-xs text-muted">{CATEGORY_BY_ID[source.category as CategoryId].name}</span>
              </td>
              <td className={td} title={formatPkt(source.lastFetchedAt)}>{ago(source.lastFetchedAt, now)}</td>
              <td className={`${td} ${stale ? "font-bold text-crimson" : ""}`} title={formatPkt(success)}>{ago(success, now)}</td>
              <td className={`${td} max-w-md break-words text-crimson`}>{source.lastError ?? ""}</td>
              <td className={td}>
                <FetchNowButton sourceId={source.id} disabled={!source.isActive} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type LogRows = Awaited<ReturnType<typeof getLogRows>>;

export function LogTable({ rows, errorsOnly, now }: { rows: LogRows; errorsOnly: boolean; now: Date }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        The last {LOG_ROWS} runs, newest first.{" "}
        <Link href={errorsOnly ? "/admin?tab=log" : "/admin?tab=log&errors=1"} className="text-brand underline">
          {errorsOnly ? "Show everything" : "Show only runs with an error"}
        </Link>
        . “Accepted” is stories saved: live, or waiting in the review queue when review is on. A source that keeps finding 0 items without an error may have gone quiet.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" data-testid="log-table">
          <thead>
            <tr>
              <th className={th}>Run at (PKT)</th>
              <th className={th}>Source</th>
              <th className={th}>Found</th>
              <th className={th}>Accepted</th>
              <th className={th}>Skipped</th>
              <th className={th}>Error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.error ? "bg-crimson-50" : row.itemsFound === 0 ? "bg-amber-50" : ""}>
                <td className={td} title={ago(row.runAt, now)}>{formatPkt(row.runAt)}</td>
                <td className={td}>{row.source.name}</td>
                <td className={td}>{row.itemsFound}</td>
                <td className={td}>{row.itemsPublished}</td>
                <td className={td}>{row.itemsSkipped}</td>
                <td className={`${td} max-w-lg break-words text-crimson`}>{row.error ?? (row.itemsFound === 0 ? <span className="text-amber-800">0 items, no error</span> : "")}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className={td} colSpan={6}>
                  {errorsOnly ? "No runs with an error. Good." : "No runs have been logged yet."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SourcesPanel({ sources }: { sources: SourceRows }) {
  return (
    <div className="flex flex-col gap-4">
      <section className="border border-line bg-surface p-3">
        <h2 className="mb-2 text-sm font-bold">Add a source</h2>
        <SourceForm />
        <p className="mt-2 text-xs text-muted">
          Name it “Outlet — Section” (for example “Dawn — Business”): the part before the dash is shown to readers as the outlet. The address is test-fetched when you save.
          The category is a default: the AI may still file a story elsewhere.
        </p>
      </section>
      <div className="flex flex-col divide-y divide-line border border-line bg-white">
        {sources.map((source) => (
          <div key={source.id} className={`p-2.5 ${source.isActive ? "" : "bg-surface"}`}>
            <SourceForm source={source} />
          </div>
        ))}
      </div>
    </div>
  );
}

type ArticleRows = Awaited<ReturnType<typeof searchArticles>>;

function pageHref(filter: ArticleFilter, page: number): string {
  const params = new URLSearchParams({ tab: "articles" });
  if (filter.q) params.set("q", filter.q);
  if (filter.category) params.set("category", filter.category);
  if (filter.status !== "PUBLISHED") params.set("status", filter.status);
  if (filter.breaking) params.set("breaking", "1");
  if (page > 1) params.set("page", String(page));
  return `/admin?${params}`;
}

export function ArticlesPanel({ result, filter, now }: { result: ArticleRows; filter: ArticleFilter; now: Date }) {
  const pages = Math.max(1, Math.ceil(result.total / ARTICLES_PER_PAGE));
  const input = "border border-line bg-white px-2 py-1.5 text-sm";
  return (
    <div className="flex flex-col gap-3">
      <form method="get" action="/admin" className="flex flex-wrap items-end gap-2 border border-line bg-surface p-2.5" data-testid="article-filters">
        <input type="hidden" name="tab" value="articles" />
        <label className="flex flex-col gap-0.5 text-xs font-bold">
          Search headline or outlet
          <input name="q" defaultValue={filter.q} className={`${input} w-64 max-w-full font-normal`} />
        </label>
        <label className="flex flex-col gap-0.5 text-xs font-bold">
          Category
          <select name="category" defaultValue={filter.category} className={`${input} font-normal`}>
            <option value="">All</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-xs font-bold">
          Show
          <select name="status" defaultValue={filter.status} className={`${input} font-normal`}>
            <option value="PUBLISHED">Live</option>
            <option value="DRAFT">Unpublished</option>
            <option value="ALL">Both</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-sm">
          <input type="checkbox" name="breaking" value="1" defaultChecked={filter.breaking} className="h-4 w-4" />
          Breaking only
        </label>
        <button type="submit" className="border border-brand bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-800">
          Search
        </button>
        <Link href="/admin?tab=articles" className="pb-1.5 text-xs text-brand underline">
          Reset
        </Link>
      </form>

      <p className="text-sm text-muted" data-testid="article-count">
        {result.total.toLocaleString("en")} {result.total === 1 ? "story" : "stories"}, newest first. Unpublish hides a story (you can republish it). Delete removes it for good and it is not fetched again.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse" data-testid="articles-table">
          <thead>
            <tr>
              <th className={th}>Story</th>
              <th className={th}>Published</th>
              <th className={th}>Category</th>
              <th className={th}>Breaking</th>
              <th className={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => {
              const live = row.status === "PUBLISHED";
              const breakingNow = isCurrentlyBreaking(row, now);
              const tooOld = now.getTime() - row.publishedAt.getTime() > BREAKING_MAX_AGE_HOURS * 3_600_000;
              return (
                <tr key={row.id} data-testid="article-row" data-status={row.status} className={live ? "" : "bg-surface text-muted"}>
                  <td className={`${td} max-w-md`}>
                    {live ? (
                      <Link href={`/article/${row.slug}`} target="_blank" className="font-semibold text-brand underline">
                        {row.title}
                      </Link>
                    ) : (
                      <span className="font-semibold">{row.title}</span>
                    )}
                    {!live ? <span className="ml-2 bg-muted px-1.5 py-0.5 text-[11px] font-bold text-white">UNPUBLISHED</span> : null}
                    <br />
                    <span className="text-xs text-muted">
                      {row.sourceName} · {row.viewCount.toLocaleString("en")} views · urgency {row.urgencyScore}
                      {row.correctedAt ? ` · updated ${ago(row.correctedAt, now)}` : ""}
                    </span>
                  </td>
                  <td className={td} title={formatPkt(row.publishedAt)}>{ago(row.publishedAt, now)}</td>
                  <td className={td}>
                    <form action={recategorizeAction} className="flex gap-1">
                      <input type="hidden" name="id" value={row.id} />
                      <select name="category" defaultValue={row.category} aria-label={`Category of ${row.title}`} className="border border-line bg-white px-1 py-1 text-xs">
                        {CATEGORIES.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className={btn}>
                        Move
                      </button>
                    </form>
                  </td>
                  <td className={td}>
                    {breakingNow ? <span className="font-bold text-crimson">Live now</span> : row.isBreaking ? <span className="text-xs text-muted">Flagged, expired</span> : <span className="text-xs text-muted">No</span>}
                  </td>
                  <td className={td}>
                    <div className="flex flex-wrap gap-1">
                      {live ? (
                        <form action={setBreakingAction}>
                          <input type="hidden" name="id" value={row.id} />
                          <input type="hidden" name="breaking" value={String(!row.isBreaking)} />
                          <button type="submit" disabled={!row.isBreaking && tooOld} title={!row.isBreaking && tooOld ? `Breaking news only shows for ${BREAKING_MAX_AGE_HOURS} hours after publication; this story is older` : undefined} className={btn}>
                            {row.isBreaking ? "Unmark breaking" : "Mark breaking"}
                          </button>
                        </form>
                      ) : null}
                      <form action={live ? unpublishAction : republishAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <button type="submit" className={btn}>
                          {live ? "Unpublish" : "Republish"}
                        </button>
                      </form>
                      <form action={deleteArticleAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <ConfirmSubmit message={`Delete “${row.title}”? It is removed from the site for good and will not be fetched again.`} className={`${btn} border-crimson text-crimson hover:bg-crimson-50`}>
                          Delete
                        </ConfirmSubmit>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {result.rows.length === 0 ? (
              <tr>
                <td className={td} colSpan={5}>
                  No stories match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
          {filter.page > 1 ? (
            <Link href={pageHref(filter, filter.page - 1)} className="text-brand underline">
              ← Newer
            </Link>
          ) : null}
          <span className="text-muted">
            Page {filter.page} of {pages}
          </span>
          {filter.page < pages ? (
            <Link href={pageHref(filter, filter.page + 1)} className="text-brand underline">
              Older →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

/** Shown in place of the dashboard when sign-in has not been configured yet. */
export function SetupNotice({ missing }: { missing: string[] }) {
  return (
    <div className="mx-auto mt-10 max-w-xl border border-line bg-surface p-5 text-sm leading-relaxed" data-testid="admin-setup">
      <h1 className="mb-2 text-lg font-bold text-brand">Admin sign-in is not set up yet</h1>
      <p>
        Nobody can sign in until an email and password are chosen. In a terminal, in the project folder, run:
      </p>
      <p className="my-2 bg-white px-3 py-2 font-mono">npm run admin:setup</p>
      <p>
        It asks for your email and a password, and saves them (the password as a one-way hash) in the <span className="font-mono">.env</span> file. Then restart the website.
      </p>
      <p className="mt-2 text-muted">Still missing: {missing.join(", ")}.</p>
    </div>
  );
}
