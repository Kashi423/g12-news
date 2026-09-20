import Link from "next/link";
import { SITE } from "@g12/config";

// Placeholder header: two-tone wordmark (red + blue, as in the logo) and the tagline.
// Navigation arrives with the page designs.
export function SiteHeader() {
  const [mark, ...rest] = SITE.name.split(" "); // "G12" + "News"

  return (
    <header className="border-b border-line bg-canvas">
      {/* Red/blue rule echoing the logo's two blocks */}
      <div className="flex h-1" aria-hidden="true">
        <div className="w-1/3 bg-crimson" />
        <div className="flex-1 bg-brand" />
      </div>
      <div className="container py-3">
        <Link href="/" aria-label={`${SITE.name} — home`} className="inline-block leading-none">
          <span className="block font-serif text-2xl font-black tracking-tight">
            <span className="text-crimson">{mark}</span> <span className="text-brand">{rest.join(" ")}</span>
          </span>
          <span className="mt-1 block text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            {SITE.tagline}
          </span>
        </Link>
      </div>
    </header>
  );
}
