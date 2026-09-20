/**
 * The fixed category list — the single source of truth for nav, filters and AI prompts.
 *
 * The `id` values MUST match the `Category` enum in packages/db/prisma/schema.prisma.
 * packages/db/src/category-check.ts fails the type-check if the two ever drift apart.
 * Array order is display order (nav, filters).
 */
export const CATEGORY_IDS = [
  "PAKISTAN",
  "WORLD",
  "POLITICS",
  "BUSINESS",
  "SPORTS",
  "SHOWBIZ",
  "TECHNOLOGY",
  "HEALTH",
  "MISCELLANEOUS",
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export interface CategoryDef {
  /** Matches the Prisma `Category` enum value. */
  id: CategoryId;
  /** URL segment, e.g. /category/pakistan. */
  slug: string;
  /** Display name. */
  name: string;
  /** Plain-language scope; also fed to the AI categorizer so it uses the same definitions as the UI. */
  description: string;
  /** Tag whose stories get priority placement inside the category (cricket leads Sports). */
  priorityTag?: string;
}

export const CATEGORIES: readonly CategoryDef[] = [
  {
    id: "PAKISTAN",
    slug: "pakistan",
    name: "Pakistan",
    description: "Local news from across Pakistan: cities, provinces, crime, courts, weather events and national affairs.",
  },
  {
    id: "WORLD",
    slug: "world",
    name: "World",
    description: "International news and foreign affairs outside Pakistan, including Pakistan's relations with other countries.",
  },
  {
    id: "POLITICS",
    slug: "politics",
    name: "Politics",
    description: "Government, parliament, political parties, elections, policy and the military establishment's role in politics.",
  },
  {
    id: "BUSINESS",
    slug: "business",
    name: "Business",
    description: "Economy, markets, PSX, the rupee, inflation, energy prices, trade, banking and companies.",
  },
  {
    id: "SPORTS",
    slug: "sports",
    name: "Sports",
    description: "Cricket first, then hockey, football and all other sports, at home and abroad.",
    priorityTag: "cricket",
  },
  {
    id: "SHOWBIZ",
    slug: "showbiz",
    name: "Showbiz",
    description: "Entertainment: film, television dramas, music, celebrities and fashion.",
  },
  {
    id: "TECHNOLOGY",
    slug: "technology",
    name: "Technology",
    description: "Tech, telecom, startups, AI, gadgets, internet and cybersecurity.",
  },
  {
    id: "HEALTH",
    slug: "health",
    name: "Health",
    description: "Public health, disease outbreaks, hospitals, medicine and wellbeing.",
  },
  {
    id: "MISCELLANEOUS",
    slug: "miscellaneous",
    name: "Miscellaneous",
    description: "Viral, human-interest and offbeat stories, weather and anything that fits no other category.",
  },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<CategoryId, CategoryDef>;

export const CATEGORY_BY_SLUG: Readonly<Record<string, CategoryDef>> = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c]),
);

export function isCategoryId(value: string): value is CategoryId {
  return (CATEGORY_IDS as readonly string[]).includes(value);
}
