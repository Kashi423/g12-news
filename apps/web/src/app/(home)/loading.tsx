import { HomeSkeleton } from "@/components/home/skeletons";

// Shown while the homepage is being fetched during navigation.
export default function Loading() {
  return <HomeSkeleton />;
}
