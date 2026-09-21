export interface ShareTarget {
  id: "whatsapp" | "facebook" | "x";
  label: string;
  href: string;
}

/**
 * Share links for one story, WhatsApp first: it is how most Pakistani readers pass news along. They are
 * plain links to each network's own share page (no scripts, trackers or SDKs). `url` must be absolute:
 * the network fetches it to build the preview from the page's Open Graph tags.
 */
export function shareTargets({ title, url }: { title: string; url: string }): ShareTarget[] {
  const q = encodeURIComponent;
  return [
    // WhatsApp takes one block of text; the link in it becomes the preview card.
    { id: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${q(`${title}\n${url}`)}` },
    { id: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${q(url)}` },
    { id: "x", label: "X", href: `https://x.com/intent/post?text=${q(title)}&url=${q(url)}` },
  ];
}
