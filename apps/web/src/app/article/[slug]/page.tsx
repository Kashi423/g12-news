import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { articlePath, categoryPath, CATEGORY_BY_ID, DISCLAIMER } from "@g12/config";
import { ActiveCategory } from "@/components/layout/active-category";
import { ArticleBody } from "@/components/article/article-body";
import { ArticleHeader } from "@/components/article/article-header";
import { ArticleHero } from "@/components/article/article-hero";
import { ReadingProgress } from "@/components/article/reading-progress";
import { RelatedStories } from "@/components/article/related-stories";
import { ShareButtons } from "@/components/article/share-buttons";
import { SourceBox } from "@/components/article/source-box";
import { TagChips } from "@/components/article/tag-chips";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { truncateLabel } from "@/lib/article/format";
import { articleMetadata } from "@/lib/article/metadata";
import { getArticle, getRelatedArticles, recordView } from "@/lib/article/queries";
import { shareTargets } from "@/lib/article/share";
import { shouldCountView } from "@/lib/article/traffic";
import { isBreakingNow } from "@/lib/home/flags";
import { articleBreadcrumbs, breadcrumbSchema, newsArticleSchema } from "@/lib/seo/json-ld";
import { getSiteInfo } from "@/lib/seo/site";
import { siteUrl } from "@/lib/site-url";

// Every request renders this page fresh: it counts the view, and a story's breaking badge and
// "Related stories" should be current. (No loading.tsx here either: with one, the response starts
// streaming before the story is looked up, and an unknown slug could no longer answer with a real 404.)
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = await getArticle((await params).slug);
  if (!article) return { title: "Story not found" };
  return articleMetadata(article);
}

export default async function ArticlePage({ params }: Props) {
  const article = await getArticle((await params).slug);
  // An unknown, malformed, draft or rejected slug: a proper 404 (see not-found.tsx), never a crash.
  if (!article) notFound();

  // Count the view once the response has gone out, so it costs the reader no time and a counter
  // failure cannot break the page. Link previews, crawlers and prefetches are not readers.
  if (shouldCountView(await headers())) after(() => recordView(article.id));

  const category = CATEGORY_BY_ID[article.category];
  const related = await getRelatedArticles(article.category, article.id);
  // The absolute address networks fetch to build a share preview (SITE_URL in .env).
  const url = new URL(articlePath(article.slug), siteUrl()).toString();

  return (
    <>
      <ReadingProgress targetId="article-content" />
      {/* Highlights the story's category in the navigation while the story is open. */}
      <ActiveCategory slug={category.slug} />
      {/* Structured data for search engines: the story, and its trail Home > Category > Story. */}
      <JsonLd data={newsArticleSchema(article, getSiteInfo())} />
      <JsonLd data={breadcrumbSchema(articleBreadcrumbs(article, getSiteInfo()))} />
      <div className="container pb-12 pt-5 lg:pt-6">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: category.name, href: categoryPath(category.slug) }, { label: truncateLabel(article.title) }]} />

        <article id="article-content" data-testid="article" className="mx-auto mt-5 max-w-[46rem]">
          <ArticleHeader article={article} category={category} breaking={isBreakingNow(article)} />
          <ArticleHero src={article.imageUrl} credit={article.imageCredit} />
          <ArticleBody body={article.body} fallback={article.excerpt} />
          <SourceBox sources={article.sources} />
          <TagChips tags={article.tags} category={category} />
          <ShareButtons targets={shareTargets({ title: article.title, url })} />
          <p className="mt-8 border-t border-line pt-4 text-xs leading-relaxed text-muted">{DISCLAIMER}</p>
        </article>

        <RelatedStories stories={related} category={category} />
      </div>
    </>
  );
}
