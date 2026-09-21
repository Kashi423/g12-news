import Image from "next/image";
import Link from "next/link";
import { SITE } from "@g12/config";
import { LOGO } from "@/lib/brand";
import { MobileMenu } from "./layout/mobile-menu";
import { PrimaryNav } from "./layout/primary-nav";
import { SearchOverlay } from "./layout/search-overlay";
import { StickyHeader } from "./layout/sticky-header";

/**
 * Main header, stuck under the breaking-news bar while the page scrolls and compact (smaller logo, less
 * padding) once the reader is past the hero. See StickyHeader for how compacting avoids moving the page.
 *
 *   Phones and tablets:  [menu button]   [logo]   [search]      (the menu slides in from the left)
 *   Desktop:             [logo]   [category navigation]   [search]
 */
export function SiteHeader() {
  return (
    <StickyHeader>
      <div className="container flex h-full items-center justify-between gap-3 lg:gap-6">
        <MobileMenu />
        <Link href="/" prefetch={false} aria-label={`${SITE.name} — home`} className="flex items-center gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          <Image
            src={LOGO.src}
            alt=""
            width={LOGO.width}
            height={LOGO.height}
            sizes="(min-width: 1024px) 92px, 72px"
            loading="eager"
            fetchPriority="high"
            className="h-14 w-auto transition-[height] duration-200 ease-out group-data-[compact=true]:h-10 motion-reduce:transition-none lg:h-[4.5rem] lg:group-data-[compact=true]:h-11"
          />
          <span className="hidden border-l border-line pl-3 text-[11px] font-semibold uppercase leading-snug tracking-[0.14em] text-muted xl:block xl:group-data-[compact=true]:hidden">
            {SITE.tagline}
          </span>
        </Link>
        <PrimaryNav />
        <SearchOverlay />
      </div>
    </StickyHeader>
  );
}
