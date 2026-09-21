-- Live "breaking news" push.
--
-- Tell anything LISTENing on `breaking_articles` (the web app's /api/breaking-stream endpoint) the
-- moment an article becomes, or stops being, a published breaking story. A trigger rather than
-- worker code, so it also covers the admin override and any other writer, not just the pipeline.
--
-- The payload is deliberately tiny ({"id": "...", "breaking": true|false}); listeners fetch the
-- article themselves. Prisma does not manage triggers, so this file is the source of truth.
-- Keep the channel name in sync with BREAKING_NOTIFY_CHANNEL in packages/config/src/breaking.ts.

CREATE OR REPLACE FUNCTION notify_breaking_article() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'breaking_articles',
    json_build_object('id', NEW."id", 'breaking', (NEW."isBreaking" AND NEW."status" = 'PUBLISHED'))::text
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- A new article that is already a published breaking story.
CREATE TRIGGER "Article_breaking_insert_notify"
AFTER INSERT ON "Article"
FOR EACH ROW
WHEN (NEW."isBreaking" AND NEW."status" = 'PUBLISHED')
EXECUTE FUNCTION notify_breaking_article();

-- An existing article that starts, or stops, being a published breaking story.
CREATE TRIGGER "Article_breaking_update_notify"
AFTER UPDATE OF "isBreaking", "status" ON "Article"
FOR EACH ROW
WHEN (
  (OLD."isBreaking" AND OLD."status" = 'PUBLISHED') IS DISTINCT FROM (NEW."isBreaking" AND NEW."status" = 'PUBLISHED')
)
EXECUTE FUNCTION notify_breaking_article();
