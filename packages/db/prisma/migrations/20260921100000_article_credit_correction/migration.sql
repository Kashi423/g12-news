-- Article page: the image credit line and the "Updated" timestamp.
--
-- Both columns are nullable and have no default, so this only adds metadata: existing rows are
-- untouched (no credit shown, never corrected) and the migration is safe to run on a live database.
--   imageCredit  photographer / agency named by the RSS feed for the story's picture
--   correctedAt  when a published story was last corrected or re-categorized (NOT bumped by views)

ALTER TABLE "Article"
  ADD COLUMN "imageCredit" TEXT,
  ADD COLUMN "correctedAt" TIMESTAMP(3);
