"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container flex min-h-[40vh] flex-col items-start justify-center gap-3 py-16">
      <p className="text-xs font-bold uppercase tracking-wide text-crimson">Something went wrong</p>
      <h1 className="font-serif text-3xl font-black text-brand">We couldn&rsquo;t load this page</h1>
      <p className="max-w-lg text-muted">This is usually temporary. Try again in a moment.</p>
      <button type="button" onClick={reset} className="mt-2 bg-brand px-5 py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-brand-800">
        Try again
      </button>
    </div>
  );
}
