import type { Metadata } from "next";
import { CATEGORY_IDS } from "@g12/config";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { LoginForm } from "@/components/admin/login-form";
import { AdminHeader, AlertBanners, ArticlesPanel, HealthTable, LogTable, PipelineStatsPanel, ReviewSwitch, SetupNotice, SourcesPanel, StatsStrip, TabNav, TABS, type TabId } from "@/components/admin/panels";
import { PendingQueue } from "@/components/admin/pending-queue";
import { computeAlerts } from "@/lib/admin/alerts";
import { adminConfig, adminConfigProblems } from "@/lib/admin/auth";
import { getHealthSnapshot, getLogRows, getPendingItems, getPipelineStats, getSources, getStats, searchArticles, type ArticleFilter, type ArticleStatusFilter } from "@/lib/admin/data";
import { isAdmin } from "@/lib/admin/session";

// The owner's page: built fresh for every request, never cached, never indexed (headers in next.config.mjs too).
export const dynamic = "force-dynamic";
// "Fetch now" runs the AI over a feed inside a server action; give hosts that cap function time room to finish.
export const maxDuration = 300;

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false, nocache: true },
  alternates: { canonical: null },
};

type Search = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value) ?? "";

function parseFilter(params: Search): ArticleFilter {
  const category = one(params.category);
  const status = one(params.status);
  const page = Number.parseInt(one(params.page), 10);
  return {
    q: one(params.q).slice(0, 200),
    category: (CATEGORY_IDS as readonly string[]).includes(category) ? (category as ArticleFilter["category"]) : "",
    status: (["PUBLISHED", "DRAFT", "ALL"].includes(status) ? status : "PUBLISHED") as ArticleStatusFilter,
    breaking: one(params.breaking) === "1",
    page: Number.isFinite(page) && page > 0 && page < 10_000 ? page : 1,
  };
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<Search> }) {
  const config = adminConfig();
  if (!config) return <Shell><SetupNotice missing={adminConfigProblems()} /></Shell>;
  if (!(await isAdmin())) return <Shell><LoginForm /></Shell>;

  const params = await searchParams;
  const now = new Date();

  let snapshot;
  let stats;
  try {
    [snapshot, stats] = await Promise.all([getHealthSnapshot(now), getStats(now)]);
  } catch (error) {
    return (
      <Shell>
        <AdminHeader email={config.email} />
        <div role="alert" className="border-l-8 border-crimson-800 bg-crimson px-4 py-3 text-white">
          <p className="font-bold">⚠ The dashboard cannot read the database</p>
          <p className="text-sm">{error instanceof Error ? error.message.slice(0, 300) : String(error)}</p>
        </div>
      </Shell>
    );
  }

  const alerts = computeAlerts(snapshot);
  const requested = one(params.tab);
  // With review on, the queue is what needs attention; otherwise the pipeline's health is.
  const tab: TabId = TABS.some((t) => t.id === requested) ? (requested as TabId) : snapshot.requireReview ? "pending" : "health";
  const overdue = snapshot.stuckCount > 0;

  return (
    <Shell>
      <AutoRefresh seconds={60} />
      <AdminHeader email={config.email} />
      <AlertBanners alerts={alerts} />
      <ReviewSwitch on={snapshot.requireReview} pendingCount={snapshot.pendingCount} />
      <StatsStrip stats={stats} pendingCount={snapshot.pendingCount} overdue={overdue && snapshot.requireReview} now={now} />
      <TabNav current={tab} pendingCount={snapshot.pendingCount} overdue={overdue} />
      <section aria-label={TABS.find((t) => t.id === tab)?.label}>
        {tab === "pending" ? <PendingTab requireReview={snapshot.requireReview} total={snapshot.pendingCount} now={now} /> : null}
        {tab === "health" ? <HealthTable sources={await getSources()} now={now} /> : null}
        {tab === "pipeline" ? <PipelineStatsPanel stats={await getPipelineStats()} /> : null}
        {tab === "log" ? <LogTable rows={await getLogRows(one(params.errors) === "1")} errorsOnly={one(params.errors) === "1"} now={now} /> : null}
        {tab === "sources" ? <SourcesPanel sources={await getSources()} /> : null}
        {tab === "articles" ? <ArticlesTab filter={parseFilter(params)} now={now} /> : null}
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-3 py-4 sm:px-5" data-testid="admin">{children}</div>;
}

async function PendingTab({ requireReview, total, now }: { requireReview: boolean; total: number; now: Date }) {
  const emptyText = requireReview
    ? "Nothing is waiting for review. New stories appear here as the pipeline finds them."
    : "Nothing is waiting for review. Turn on “Require review before publish” above to hold every new story here until you approve it.";
  return <PendingQueue items={await getPendingItems(now)} total={total} emptyText={emptyText} />;
}

async function ArticlesTab({ filter, now }: { filter: ArticleFilter; now: Date }) {
  return <ArticlesPanel result={await searchArticles(filter)} filter={filter} now={now} />;
}
