/**
 * og:locale for every page. It must be one of the locales Facebook's crawler knows, and Facebook's list
 * has no Pakistani English (en_PK), so an unknown value could be ignored or flagged. en_GB is the closest
 * supported one: Pakistani English follows British spelling, and it is what most of the outlets we
 * summarize use. (The page's own <html lang> stays "en".)
 */
export const OG_LOCALE = "en_GB";
