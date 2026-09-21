"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { categoryPath, PRIMARY_NAV_CATEGORIES } from "@g12/config";

/**
 * Main category navigation. On phones it is a swipeable single row under the logo; from `lg` up it
 * sits inline. The current category is underlined in red.
 */
export function PrimaryNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Categories" className="-mx-4 order-3 w-[calc(100%+2rem)] border-t border-line px-4 lg:order-2 lg:mx-0 lg:w-auto lg:border-t-0 lg:px-0">
      <ul className="flex items-stretch gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:gap-2 lg:overflow-visible">
        {PRIMARY_NAV_CATEGORIES.map((category) => {
          const href = categoryPath(category.slug);
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={category.id} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-11 items-center border-b-[3px] px-2.5 text-[13px] font-bold uppercase tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand lg:h-14 lg:px-2 xl:px-3 ${
                  active ? "border-crimson text-crimson" : "border-transparent text-ink hover:border-brand hover:text-brand"
                }`}
              >
                {category.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
