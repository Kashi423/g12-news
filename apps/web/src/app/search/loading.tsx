import { Bone } from "@/components/home/skeletons";

// Shown while a search runs during navigation. The page itself never 404s, so a loading state is safe here.
export default function Loading() {
  return (
    <div role="status" aria-label="Searching" className="container pb-12 pt-5 lg:pt-6">
      <Bone className="h-4 w-32" />
      <Bone className="mt-5 h-9 w-2/3 max-w-md" />
      <Bone className="mt-5 h-12 max-w-2xl" />
      <ul className="mt-8 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <li key={i}>
            <Bone className="aspect-[16/10] w-full" />
            <Bone className="mt-3 h-5 w-full" />
            <Bone className="mt-2 h-5 w-4/5" />
            <Bone className="mt-3 h-3 w-1/2" />
          </li>
        ))}
      </ul>
    </div>
  );
}
