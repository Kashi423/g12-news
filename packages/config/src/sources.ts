import type { CategoryId } from "./categories";

export interface SourceDef {
  /** Unique label for this feed, shown in the admin dashboard, e.g. "Dawn — Pakistan". */
  name: string;
  /** Outlet name used for attribution on articles (Article.sourceName), e.g. "Dawn". */
  outlet: string;
  rssUrl: string;
  /**
   * Default category for stories from this feed (Source.category); the AI re-categorizes every article.
   * WORLD feeds are treated as international: only Pakistan-relevant or major stories are published.
   */
  category: CategoryId;
}

/**
 * Starter RSS feeds. Each was fetched on 2026-09-20 and returned valid RSS whose newest item was
 * under 48 hours old. Feeds change paths often, so `npm run seed` re-verifies them before inserting.
 *
 * Checked and deliberately absent: Samaa TV (no feed found), Al Jazeera (connection reset from the
 * dev machine, unverifiable), Reuters (discontinued public RSS), AP (403), Geo Urdu and Dunya (serve
 * HTML, not RSS), and dedicated Politics / Health feeds from Tribune and The News (stale for
 * months). Politics stories arrive through the general feeds and are filed by the AI.
 *
 * Note: Dawn and Business Recorder include full article text in their feeds; Express Tribune, ARY,
 * BBC and Cricinfo give only a headline and a sentence, so briefs from those are necessarily short.
 */
export const SOURCES: readonly SourceDef[] = [
  // Pakistan
  { name: "Dawn — Pakistan", outlet: "Dawn", rssUrl: "https://www.dawn.com/feeds/pakistan", category: "PAKISTAN" },
  { name: "The Express Tribune — Pakistan", outlet: "The Express Tribune", rssUrl: "https://tribune.com.pk/feed/pakistan", category: "PAKISTAN" },
  { name: "Geo News — Pakistan", outlet: "Geo News", rssUrl: "https://www.geo.tv/rss/1/1", category: "PAKISTAN" },
  { name: "The News — Latest", outlet: "The News International", rssUrl: "https://www.thenews.com.pk/rss/1/0", category: "PAKISTAN" },
  { name: "ARY News", outlet: "ARY News", rssUrl: "https://arynews.tv/feed/", category: "PAKISTAN" },
  { name: "The Guardian — Pakistan", outlet: "The Guardian", rssUrl: "https://www.theguardian.com/world/pakistan/rss", category: "PAKISTAN" },

  // World (international feeds: Pakistan-relevant or major stories only)
  { name: "Dawn — World", outlet: "Dawn", rssUrl: "https://www.dawn.com/feeds/world", category: "WORLD" },
  { name: "BBC News — World", outlet: "BBC News", rssUrl: "https://feeds.bbci.co.uk/news/world/rss.xml", category: "WORLD" },
  { name: "BBC News — Asia", outlet: "BBC News", rssUrl: "https://feeds.bbci.co.uk/news/world/asia/rss.xml", category: "WORLD" },
  { name: "The Guardian — World", outlet: "The Guardian", rssUrl: "https://www.theguardian.com/world/rss", category: "WORLD" },
  { name: "France 24", outlet: "France 24", rssUrl: "https://www.france24.com/en/rss", category: "WORLD" },

  // Business
  { name: "Dawn — Business", outlet: "Dawn", rssUrl: "https://www.dawn.com/feeds/business", category: "BUSINESS" },
  { name: "Business Recorder", outlet: "Business Recorder", rssUrl: "https://www.brecorder.com/feeds/latest-news", category: "BUSINESS" },
  { name: "The Express Tribune — Business", outlet: "The Express Tribune", rssUrl: "https://tribune.com.pk/feed/business", category: "BUSINESS" },
  { name: "Geo News — Business", outlet: "Geo News", rssUrl: "https://www.geo.tv/rss/1/3", category: "BUSINESS" },

  // Sports (cricket first)
  { name: "ESPNcricinfo — Pakistan", outlet: "ESPNcricinfo", rssUrl: "https://www.espncricinfo.com/rss/content/story/feeds/7.xml", category: "SPORTS" },
  { name: "Dawn — Sport", outlet: "Dawn", rssUrl: "https://www.dawn.com/feeds/sport", category: "SPORTS" },
  { name: "Geo News — Sports", outlet: "Geo News", rssUrl: "https://www.geo.tv/rss/1/4", category: "SPORTS" },
  { name: "The News — Sports", outlet: "The News International", rssUrl: "https://www.thenews.com.pk/rss/1/3", category: "SPORTS" },

  // Showbiz
  { name: "Geo News — Entertainment", outlet: "Geo News", rssUrl: "https://www.geo.tv/rss/1/5", category: "SHOWBIZ" },
  { name: "The News — Entertainment", outlet: "The News International", rssUrl: "https://www.thenews.com.pk/rss/1/10", category: "SHOWBIZ" },
  { name: "The Express Tribune — Life & Style", outlet: "The Express Tribune", rssUrl: "https://tribune.com.pk/feed/life-style", category: "SHOWBIZ" },

  // Technology
  { name: "Dawn — Tech", outlet: "Dawn", rssUrl: "https://www.dawn.com/feeds/tech", category: "TECHNOLOGY" },
  { name: "ProPakistani", outlet: "ProPakistani", rssUrl: "https://propakistani.pk/feed/", category: "TECHNOLOGY" },
  { name: "Business Recorder — Technology", outlet: "Business Recorder", rssUrl: "https://www.brecorder.com/feeds/technology", category: "TECHNOLOGY" },
  { name: "The Express Tribune — Technology", outlet: "The Express Tribune", rssUrl: "https://tribune.com.pk/feed/technology", category: "TECHNOLOGY" },

  // Health
  { name: "Geo News — Health", outlet: "Geo News", rssUrl: "https://www.geo.tv/rss/1/6", category: "HEALTH" },
  { name: "The News — Health", outlet: "The News International", rssUrl: "https://www.thenews.com.pk/rss/1/12", category: "HEALTH" },

  // Miscellaneous
  { name: "Geo News — Amazing", outlet: "Geo News", rssUrl: "https://www.geo.tv/rss/1/7", category: "MISCELLANEOUS" },
];
