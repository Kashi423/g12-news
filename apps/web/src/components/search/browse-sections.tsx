import Link from "next/link";
import { categoryPath, CATEGORIES } from "@g12/config";

/** "Or browse a section": a row of links to all nine categories. Used where a search has nothing to show. */
export function BrowseSections({ onNavigate, className = "" }: { onNavigate?: () => void; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs font-bold uppercase tracking-wide text-muted">Or browse a section</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {CATEGORIES.map((category) => (
          <li key={category.id}>
            <Link href={categoryPath(category.slug)} onClick={onNavigate} className="inline-block border border-line px-3 py-1.5 text-sm font-medium hover:border-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
