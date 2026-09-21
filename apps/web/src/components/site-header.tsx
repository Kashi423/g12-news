import Image from "next/image";
import Link from "next/link";
import { SITE } from "@g12/config";
import { LOGO } from "@/lib/brand";
import { PrimaryNav } from "./layout/primary-nav";
import { SearchOverlay } from "./layout/search-overlay";

/**
 * Main header: the G12 News logo, the category navigation and the search button.
 * Phones: logo and search on the first row, the swipeable nav on a second row. Desktop: one row.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-line bg-canvas">
      <div className="container flex flex-wrap items-center justify-between gap-x-6 lg:flex-nowrap">
        <Link href="/" aria-label={`${SITE.name} — home`} className="order-1 flex items-center gap-3 py-2 lg:py-2.5">
          <Image
            src={LOGO.src}
            alt=""
            width={LOGO.width}
            height={LOGO.height}
            sizes="(min-width: 1024px) 92px, 72px"
            loading="eager"
            fetchPriority="high"
            className="h-14 w-auto lg:h-[4.5rem]"
          />
          <span className="border-l border-line pl-3 text-[10px] font-semibold uppercase leading-snug tracking-[0.14em] text-muted sm:text-[11px]">{SITE.tagline}</span>
        </Link>
        <div className="order-2 lg:order-3">
          <SearchOverlay />
        </div>
        <PrimaryNav />
      </div>
    </header>
  );
}
