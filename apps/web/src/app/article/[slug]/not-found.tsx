import Link from "next/link";
import { categoryPath, PRIMARY_NAV_CATEGORIES } from "@g12/config";

/** Shown (with a real 404 status) for a story address that is unknown, malformed, or no longer public. */
export default function ArticleNotFound() {
  return (
    <div className="container flex min-h-[40vh] flex-col items-start justify-center gap-3 py-16" data-testid="article-not-found">
      <p className="text-xs font-bold uppercase tracking-wide text-crimson">404</p>
      <h1 className="font-serif text-3xl font-black text-brand">Story not found</h1>
      <p className="max-w-lg text-muted">This story may have been removed, or the link may be mistyped. Try the homepage, or browse a category below.</p>
      <Link href="/" className="mt-2 bg-brand px-5 py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-brand-800">
        Back to the homepage
      </Link>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
        {PRIMARY_NAV_CATEGORIES.map((category) => (
          <li key={category.id}>
            <Link href={categoryPath(category.slug)} className="text-brand hover:underline">
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
