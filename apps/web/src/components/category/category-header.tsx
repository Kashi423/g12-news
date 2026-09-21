import type { CategoryDef } from "@g12/config";
import { CategoryBreakingBadge } from "./category-breaking-badge";

/** Category name, its one-line description and, while it has breaking news, the BREAKING badge. */
export function CategoryHeader({ category, className = "" }: { category: CategoryDef; className?: string }) {
  return (
    <header className={`border-b-2 border-brand pb-4 ${className}`} data-testid="category-header">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="font-serif text-3xl font-black tracking-tight text-brand sm:text-4xl">{category.name}</h1>
        <CategoryBreakingBadge categoryId={category.id} />
      </div>
      <p className="mt-1.5 text-base text-muted sm:text-lg">{category.tagline}</p>
    </header>
  );
}
