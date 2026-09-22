-- RSS -> AI -> Publish pipeline upgrade: story clustering, cross-source verification, claim
-- validation / quality scoring, social-post tracking, and a run lock.
--
-- Additive only: nothing existing is changed or dropped, so this is safe on a live database.
--   Source.reliability        editorial trust, 1-5, admin-set (defaults to the middle)
--   StoryCluster              one event, one or more ClusterSource rows, at most one public Article
--   ClusterSource             one RSS report that fed a cluster (source, url, guid, snapshot text)
--   ArticleRevision           a content snapshot taken just before a corroborating source changed it
--   SocialPost                one platform's publish attempt for one article
--   PipelineLock              a named mutex so at most one ingestion pass runs at a time
--   Article.clusterId/qualityScore/verification/developing/contentUpdatedAt  see schema.prisma

ALTER TABLE "Source" ADD COLUMN "reliability" INTEGER NOT NULL DEFAULT 3;

CREATE TABLE "StoryCluster" (
    "id" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryCluster_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Article"
  ADD COLUMN "clusterId" TEXT,
  ADD COLUMN "qualityScore" INTEGER,
  ADD COLUMN "verification" JSONB,
  ADD COLUMN "developing" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "contentUpdatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Article_clusterId_key" ON "Article"("clusterId");

ALTER TABLE "Article" ADD CONSTRAINT "Article_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "StoryCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ClusterSource" (
    "id" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "guid" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClusterSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClusterSource_url_key" ON "ClusterSource"("url");
CREATE INDEX "ClusterSource_clusterId_idx" ON "ClusterSource"("clusterId");

ALTER TABLE "ClusterSource" ADD CONSTRAINT "ClusterSource_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "StoryCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClusterSource" ADD CONSTRAINT "ClusterSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ArticleRevision" (
    "id" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ArticleRevision_articleId_createdAt_idx" ON "ArticleRevision"("articleId", "createdAt" DESC);

ALTER TABLE "ArticleRevision" ADD CONSTRAINT "ArticleRevision_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "StoryCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArticleRevision" ADD CONSTRAINT "ArticleRevision_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "postId" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SocialPost_articleId_idx" ON "SocialPost"("articleId");
CREATE INDEX "SocialPost_status_idx" ON "SocialPost"("status");

ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PipelineLock" (
    "key" TEXT NOT NULL,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "PipelineLock_pkey" PRIMARY KEY ("key")
);
