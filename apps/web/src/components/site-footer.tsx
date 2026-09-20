import { SITE } from "@g12/config";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="container space-y-1 py-6 text-sm text-muted">
        <p>
          &copy; {new Date().getFullYear()} {SITE.name}. All rights reserved.
        </p>
        <p>{SITE.disclaimer}</p>
      </div>
    </footer>
  );
}
