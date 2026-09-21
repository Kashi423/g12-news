import { CategoryPageSkeleton } from "@/components/category/skeletons";

// Shown at once when a reader opens a category, while its stories are fetched.
export default function Loading() {
  return <CategoryPageSkeleton />;
}
