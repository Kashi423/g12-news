/**
 * Slugs are made by the worker (`slugify` in apps/worker/src/ingest/url.ts): lowercase letters and
 * digits joined by single hyphens, at most ~90 characters. Anything else in the URL cannot be one of
 * our stories, so it is answered with a 404 without asking the database.
 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 160;

export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_SLUG_LENGTH && SLUG.test(slug);
}
