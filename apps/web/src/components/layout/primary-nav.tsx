"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { categoryPath, PRIMARY_NAV_CATEGORIES } from "@g12/config";
import { useActiveCategory } from "./active-category";

/**
 * The category navigation for desktop (from `lg` up; phones and tablets get the slide-out menu instead).
 * The category the reader is in is underlined in red: on its own page, and on any story that belongs to it.
 * The links stretch the full height of the header, so the underline sits on the header's bottom edge
 * whether the header is full size or compact.
 */
export function PrimaryNav() {
  const pathname = usePathname();
  const storyCategory = useActiveCategory();
  return (
    <nav aria-label="Categories" className="hidden self-stretch lg:block">
      <ul className="flex h-full items-stretch gap-1 xl:gap-2">
        {PRIMARY_NAV_CATEGORIES.map((category) => {
          const href = categoryPath(category.slug);
          const onPage = pathname === href || pathname.startsWith(`${href}/`);
          const inSection = !onPage && storyCategory === category.slug;
          return (
            <li key={category.id} className="h-full">
              <Link
                href={href}
                aria-current={onPage ? "page" : inSection ? "true" : undefined}
                className={`flex h-full items-center border-b-[3px] px-2 text-[13px] font-bold uppercase tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand xl:px-3 ${
                  onPage || inSection ? "border-crimson text-crimson" : "border-transparent text-ink hover:border-brand hover:text-brand"
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
