import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { categoryBySlug } from "@g12/config";
import { ArticleGrid } from "@/components/category/article-grid";
import { CategoryHeader } from "@/components/category/category-header";
import { NoMatchingStories, NoStoriesYet } from "@/components/category/empty-state";
import { FilterBar } from "@/components/category/filter-bar";
import { Pagination } from "@/components/category/pagination";
import { CategorySidebar } from "@/components/category/sidebar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { categoryMetadata } from "@/lib/category/metadata";
import { getCategoryPage, getCategoryTags } from "@/lib/category/queries";
import { categoryHref, parseCategoryQuery, type RawSearchParams } from "@/lib/category/query";

// This page reads ?tag= / ?sort= / ?after= / ?before=, so Next.js renders it for each request. An unknown
// slug is turned into a 404 by layout.tsx, before rendering starts.

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const category = categoryBySlug((await params).slug);
  if (!category) return {};
  return categoryMetadata(category, parseCategoryQuery(await searchParams));
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const category = categoryBySlug((await params).slug);
  // layout.tsx has already rejected unknown slugs; this narrows the type.
  if (!category) notFound();

  const query = parseCategoryQuery(await searchParams);
  const [page, tags] = await Promise.all([getCategoryPage(category.id, query), getCategoryTags(category.id)]);

  // A cursor that turned out to lead to the very first page (the "Newer stories" link from page 2 does,
  // or an old link whose place in the list is gone): show that page at its plain address, not at ?before=...
  if (query.cursor && page.newerCursor === null) redirect(categoryHref(category.slug, { sort: query.sort, tag: query.tag }));

  const hasStories = page.articles.length > 0;

  return (
    <div className="container pb-12 pt-5 lg:pt-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: category.name }]} />
      <CategoryHeader category={category} className="mt-4" />

      {/* grid-cols-[minmax(0,1fr)] (not the implicit auto column) keeps wide content from stretching the page on phones */}
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          {/* With no stories and no topic chosen there is nothing to filter, so the bar is left out. */}
          {(hasStories || query.tag !== null) && <FilterBar category={category} tags={tags} query={query} />}
          {hasStories ? (
            <>
              <ArticleGrid articles={page.articles} />
              <Pagination slug={category.slug} query={query} olderCursor={page.olderCursor} newerCursor={page.newerCursor} />
            </>
          ) : query.tag !== null ? (
            <NoMatchingStories category={category} tag={query.tag} sort={query.sort} />
          ) : (
            <NoStoriesYet category={category} />
          )}
        </div>
        <CategorySidebar current={category.id} />
      </div>
    </div>
  );
}
