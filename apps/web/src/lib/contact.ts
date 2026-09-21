/**
 * The public contact address, from CONTACT_EMAIL in `.env`. It is never made up: until the operator sets
 * it, the Contact page says the address is not published yet. Anything that does not look like an email
 * address (including a value with spaces or angle brackets) counts as not set.
 */
export function parseContactEmail(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value) ? value : null;
}

export function contactEmail(): string | null {
  return parseContactEmail(process.env.CONTACT_EMAIL);
}
