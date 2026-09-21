import Link from "next/link";

export interface Crumb {
  label: string;
  /** Omit on the last crumb: the current page is not a link. */
  href?: string;
}

/** "Home / Sports". The last crumb is the current page. Reusable for article pages later. */
export function Breadcrumbs({ items, className = "" }: { items: readonly Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={className} data-testid="breadcrumbs">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        {items.map((item, index) => (
          <li key={item.label} className="flex items-center gap-2">
            {index > 0 && (
              <span aria-hidden="true" className="text-line">
                /
              </span>
            )}
            {item.href && index < items.length - 1 ? (
              <Link href={item.href} className="hover:text-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-semibold text-ink">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
