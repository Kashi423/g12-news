-- Admin dashboard (/admin).
--
-- Additive only: nothing existing is changed or dropped, so this is safe on a live database.
--   ArticleStatus.PENDING_REVIEW  stories held back while "Require review before publish" is on
--   Source.lastSuccessAt          last fetch that worked (lastFetchedAt is the last attempt, good or bad)
--   Setting                       sitewide switches (key/value); a missing row means "default"
--   ArticleDailyView              views per story per Pakistan day, for "most-viewed story today"
--
-- The enum value is not used anywhere in this file: Postgres does not let a value added by
-- ALTER TYPE be used in the same transaction.

ALTER TYPE "ArticleStatus" ADD VALUE 'PENDING_REVIEW';

ALTER TABLE "Source" ADD COLUMN "lastSuccessAt" TIMESTAMP(3);

-- Sources whose last attempt worked have, by definition, just succeeded.
UPDATE "Source" SET "lastSuccessAt" = "lastFetchedAt" WHERE "lastFetchedAt" IS NOT NULL AND "lastError" IS NULL;

CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "ArticleDailyView" (
    "articleId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ArticleDailyView_pkey" PRIMARY KEY ("articleId","day")
);

CREATE INDEX "ArticleDailyView_day_views_idx" ON "ArticleDailyView"("day", "views" DESC);

ALTER TABLE "ArticleDailyView" ADD CONSTRAINT "ArticleDailyView_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
