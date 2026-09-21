import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container flex min-h-[40vh] flex-col items-start justify-center gap-3 py-16">
      <p className="text-xs font-bold uppercase tracking-wide text-crimson">404</p>
      <h1 className="font-serif text-3xl font-black text-brand">Page not found</h1>
      <p className="max-w-lg text-muted">The page you are looking for does not exist or has not been built yet.</p>
      <Link href="/" className="mt-2 bg-brand px-5 py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-brand-800">
        Back to the homepage
      </Link>
    </div>
  );
}
