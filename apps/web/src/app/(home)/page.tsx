import { Suspense } from "react";
import { HOMEPAGE_SECTION_IDS, SITE } from "@g12/config";
import { BreakingBlock } from "@/components/breaking/breaking-block";
import { CategorySection } from "@/components/home/category-section";
import { Hero } from "@/components/home/hero";
import { HeroSkeleton, SectionSkeleton, TrendingSkeleton } from "@/components/home/skeletons";
import { Trending } from "@/components/home/trending";

// Static page, regenerated in the background at most once a minute (incremental static regeneration).
// If a regeneration fails (say the database is briefly down), Next.js keeps serving the last good page.
export const revalidate = 60;

export default function HomePage() {
  return (
    <>
      <h1 className="sr-only">
        {SITE.name}: {SITE.tagline}
      </h1>

      <div className="container pt-5 lg:pt-6">
        <Suspense fallback={<HeroSkeleton />}>
          <Hero />
        </Suspense>
      </div>

      <BreakingBlock />

      {/* Trending is the sidebar on desktop; on phones it moves above the category sections so it is not buried. */}
      {/* grid-cols-[minmax(0,1fr)] (not the implicit auto column) stops the swipeable card rows from widening the page on phones */}
      <div className="container grid grid-cols-[minmax(0,1fr)] gap-8 pb-10 pt-2 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
        <div className="space-y-10 lg:space-y-12">
          {HOMEPAGE_SECTION_IDS.map((id) => (
            <Suspense key={id} fallback={<SectionSkeleton />}>
              <CategorySection categoryId={id} />
            </Suspense>
          ))}
        </div>
        <aside aria-label="Trending" className="order-first lg:order-last">
          <div className="lg:sticky lg:top-14">
            <Suspense fallback={<TrendingSkeleton />}>
              <Trending />
            </Suspense>
          </div>
        </aside>
      </div>
    </>
  );
}
