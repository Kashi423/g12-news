/**
 * Sitewide disclaimer. Render it in the footer and on every article page.
 * Stories are AI-summarized, so readers must always be told where they come from.
 */
export const DISCLAIMER =
  "G12 News is an automated aggregator. Stories are AI-summarized from the original outlets linked in each article.";

/** `rel` for every outbound "Source: [Outlet] →" link on an article page. */
export const SOURCE_LINK_REL = "nofollow noopener";

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
