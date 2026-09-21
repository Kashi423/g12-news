import { Bone, TrendingSkeleton } from "../home/skeletons";

/**
 * Shown while a category page loads (loading.tsx). Same skeleton language as the homepage's: the
 * same grid and card proportions, so the real page replaces it without a jump.
 */
export function CategoryPageSkeleton() {
  return (
    <div className="container pb-12 pt-5 lg:pt-6" role="status" aria-label="Loading stories">
      <Bone className="h-4 w-32" />
      <div className="mt-4 border-b-2 border-line pb-4">
        <Bone className="h-10 w-48" />
        <Bone className="mt-3 h-5 w-full max-w-md" />
      </div>
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <div className="mb-6 flex items-start justify-between gap-6 border-b border-line pb-4">
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Bone key={i} className="h-8 w-16" />
              ))}
            </div>
            <Bone className="h-8 w-52" />
          </div>
          <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i}>
                <Bone className="aspect-[16/10] w-full" />
                <Bone className="mt-3 h-5 w-full" />
                <Bone className="mt-2 h-5 w-4/5" />
                <Bone className="mt-3 h-3 w-full" />
                <Bone className="mt-3 h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
        <aside>
          <TrendingSkeleton />
        </aside>
      </div>
    </div>
  );
}
