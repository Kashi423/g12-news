/**
 * Sitewide disclaimer. Render it in the footer and on every article page.
 * Readers must always be told where a story's reporting came from. Deliberately says nothing about
 * how the summary was produced (no "AI", "automated" or similar) — that fuller disclosure lives on
 * the dedicated /disclaimer page instead, not on the article-reading surface (see DisclaimerPage).
 */
export const DISCLAIMER = "G12 News is a news aggregator. Every story is based on reporting from the outlet linked within it.";

/**
 * `rel` for every outbound "Originally reported by [Outlet]" link on an article page: it passes no
 * search ranking to the outlet (nofollow), and the new tab cannot reach back into ours (noopener)
 * nor be told which page it came from (noreferrer).
 */
export const SOURCE_LINK_REL = "nofollow noopener noreferrer";

/** Articles with urgencyScore >= this are flagged isBreaking. */
export const BREAKING_URGENCY_THRESHOLD = 7;

/** Never fetch a given RSS feed more often than this. */
export const MIN_FETCH_INTERVAL_MINUTES = 10;

export const SITE = {
  name: "G12 News",
  tagline: "Pakistan, As It Happens",
  description:
    "Breaking news and headlines from Pakistan and the world — Pakistan, politics, business, cricket and sports, showbiz, technology and health.",
  disclaimer: DISCLAIMER,
} as const;
