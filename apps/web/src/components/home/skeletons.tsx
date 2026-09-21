/**
 * Loading placeholders, one per homepage section. Each has the same dimensions as the real thing
 * (same aspect ratios, same grid), so swapping them for content never moves the page.
 */

export function Bone({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-line/70 motion-reduce:animate-none ${className}`} />;
}

export function HeroSkeleton() {
  return (
    <div role="status" aria-label="Loading top stories" className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
      <div className="lg:col-span-2">
        <Bone className="aspect-[16/9] w-full" />
        <Bone className="mt-4 h-3 w-24" />
        <Bone className="mt-3 h-8 w-full" />
        <Bone className="mt-2 h-8 w-4/5" />
        <Bone className="mt-4 h-4 w-full" />
        <Bone className="mt-2 h-4 w-3/4" />
      </div>
      <div className="divide-y divide-line lg:border-l lg:border-line lg:pl-8">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3 py-4 first:pt-0">
            <Bone className="aspect-[4/3] w-28 shrink-0 sm:w-40 lg:w-32 xl:w-40" />
            <div className="flex-1">
              <Bone className="h-3 w-16" />
              <Bone className="mt-2 h-4 w-full" />
              <Bone className="mt-2 h-4 w-5/6" />
              <Bone className="mt-3 h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SectionSkeleton() {
  return (
    <div role="status" aria-label="Loading stories">
      <div className="mb-4 flex items-end justify-between border-b-2 border-line pb-2">
        <Bone className="h-7 w-32" />
        <Bone className="h-4 w-28" />
      </div>
      <div className="-mx-4 flex gap-4 overflow-hidden px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-x-5 sm:gap-y-7 sm:px-0 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`w-[76%] shrink-0 sm:w-auto ${i > 1 ? "hidden sm:block" : ""}`}>
            <Bone className="aspect-[16/10] w-full" />
            <Bone className="mt-3 h-5 w-full" />
            <Bone className="mt-2 h-5 w-4/5" />
            <Bone className="mt-3 h-3 w-full" />
            <Bone className="mt-3 h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TrendingSkeleton() {
  return (
    <div role="status" aria-label="Loading trending stories" className="border border-line bg-surface p-4 lg:p-5">
      <Bone className="mb-4 h-6 w-40" />
      <div className="divide-y divide-line">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <Bone className="h-8 w-7 shrink-0" />
            <div className="flex-1">
              <Bone className="h-4 w-full" />
              <Bone className="mt-2 h-4 w-4/5" />
              <Bone className="mt-2 h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The whole homepage while its route loads (used by loading.tsx on navigation). */
export function HomeSkeleton() {
  return (
    <>
      <div className="container pt-5 lg:pt-6">
        <HeroSkeleton />
      </div>
      <div className="container grid grid-cols-[minmax(0,1fr)] gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
        <div className="space-y-10">
          <SectionSkeleton />
          <SectionSkeleton />
        </div>
        <aside className="order-first lg:order-last">
          <TrendingSkeleton />
        </aside>
      </div>
    </>
  );
}
