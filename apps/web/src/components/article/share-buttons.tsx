import type { ShareTarget } from "@/lib/article/share";
import { SOCIAL_ICON_PATHS } from "../layout/social-links";

const BASE =
  "inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

// WhatsApp leads, and is the one filled button: it is how most readers here pass a story on.
const STYLE: Record<ShareTarget["id"], string> = {
  whatsapp: `${BASE} bg-[#0A7A6A] text-white hover:bg-[#086356]`,
  facebook: `${BASE} border border-line bg-canvas text-ink hover:border-brand hover:text-brand`,
  x: `${BASE} border border-line bg-canvas text-ink hover:border-brand hover:text-brand`,
};

/** "Share this story": plain links to WhatsApp, Facebook and X, in that order. They open in a new tab. */
export function ShareButtons({ targets }: { targets: readonly ShareTarget[] }) {
  return (
    <section aria-labelledby="share-heading" data-testid="share-buttons" className="mt-8">
      <h2 id="share-heading" className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
        Share this story
      </h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {targets.map((target) => (
          <li key={target.id} className="max-sm:flex-1">
            <a href={target.href} target="_blank" rel="noopener noreferrer" data-share={target.id} className={`${STYLE[target.id]} max-sm:w-full`}>
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden="true">
                <path d={SOCIAL_ICON_PATHS[target.id]} />
              </svg>
              {target.label}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
