import Image from "next/image";
import Link from "next/link";
import { categoryPath, CATEGORIES, SITE, SITE_PAGES } from "@g12/config";
import { LOGO } from "@/lib/brand";
import { SocialLinks } from "./layout/social-links";

const linkClass = "text-sm text-white/75 transition-colors hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-brand-950 text-white" data-testid="site-footer">
      <div className="container grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-10">
        <div className="sm:col-span-2 lg:col-span-1">
          <Link href="/" className="inline-block overflow-hidden rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" aria-label={`${SITE.name} — home`}>
            <Image src={LOGO.src} alt="" width={LOGO.width} height={LOGO.height} sizes="160px" className="h-auto w-40" />
          </Link>
          <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-white/60">{SITE.tagline}</p>
          <p className="mt-4 text-sm leading-relaxed text-white/70">Pakistan and world news, summarized automatically from the outlets we link to in every story.</p>
          <div className="mt-4">
            <SocialLinks className="h-9 w-9 border border-white/25 text-white/85 hover:bg-white/15 hover:text-white" />
          </div>
        </div>

        <nav aria-label="Sections" className="sm:col-span-1 lg:col-span-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-white/60">Sections</h2>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {CATEGORIES.map((category) => (
              <li key={category.id}>
                <Link href={categoryPath(category.slug)} className={linkClass}>
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="About G12 News">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-white/60">G12 News</h2>
          <ul className="mt-3 space-y-2">
            {SITE_PAGES.map((page) => (
              <li key={page.href}>
                <Link href={page.href} className={linkClass}>
                  {page.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-white/15">
        <div className="container space-y-1 py-5 text-xs leading-relaxed text-white/65">
          <p>
            &copy; {new Date().getFullYear()} {SITE.name}. All rights reserved.
          </p>
          <p>{SITE.disclaimer}</p>
        </div>
      </div>
    </footer>
  );
}
