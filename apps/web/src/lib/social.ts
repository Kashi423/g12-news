export interface SocialLink {
  id: "facebook" | "x" | "whatsapp";
  label: string;
  href: string;
}

/**
 * G12 News's social accounts. Set the real URLs in .env (NEXT_PUBLIC_FACEBOOK_URL, NEXT_PUBLIC_X_URL,
 * NEXT_PUBLIC_WHATSAPP_URL); until then each icon links to that network's home page.
 */
export function getSocialLinks(env: Record<string, string | undefined> = process.env): SocialLink[] {
  return [
    { id: "facebook", label: "Facebook", href: env.NEXT_PUBLIC_FACEBOOK_URL || "https://www.facebook.com/" },
    { id: "x", label: "X", href: env.NEXT_PUBLIC_X_URL || "https://x.com/" },
    { id: "whatsapp", label: "WhatsApp channel", href: env.NEXT_PUBLIC_WHATSAPP_URL || "https://www.whatsapp.com/channels/" },
  ];
}
