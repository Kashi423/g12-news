import { Breadcrumbs } from "../layout/breadcrumbs";

/**
 * Shared frame for the About, Contact, Privacy and Disclaimer pages: breadcrumb, serif headline, a short
 * intro, then plain readable text in a narrow column. Headings, paragraphs, lists and links inside
 * `children` are styled here, so each page is written as ordinary HTML.
 */
export function StaticPage({ title, intro, updated, children }: { title: string; intro?: React.ReactNode; updated?: string; children: React.ReactNode }) {
  return (
    <div className="container pb-14 pt-5 lg:pt-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: title }]} />
      <article data-testid="static-page" className="mx-auto mt-6 max-w-[46rem]">
        <h1 className="font-serif text-[1.9rem] font-black leading-tight tracking-tight text-ink sm:text-4xl">{title}</h1>
        {intro && <p className="mt-4 text-lg leading-relaxed text-muted">{intro}</p>}
        <div
          className={
            "mt-8 text-[1.0625rem] leading-[1.8] text-ink " +
            "[&_h2]:mt-10 [&_h2]:border-t-2 [&_h2]:border-brand [&_h2]:pt-4 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:font-black [&_h2]:leading-snug [&_h2]:tracking-tight [&_h2]:text-brand " +
            "[&_h2:first-child]:mt-0 [&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 " +
            "[&_a]:font-semibold [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-brand-800 [&_strong]:font-bold"
          }
        >
          {children}
        </div>
        {updated && <p className="mt-12 border-t border-line pt-4 text-xs text-muted">Last updated {updated}.</p>}
      </article>
    </div>
  );
}

/** A highlighted statement inside a static page (the sitewide disclaimer, a notice). */
export function Callout({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} className="mt-6 border border-line border-l-4 border-l-brand bg-surface p-4 text-base leading-relaxed sm:p-5">
      {children}
    </div>
  );
}
