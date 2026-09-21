import type { Metadata } from "next";
import Link from "next/link";
import { Callout, StaticPage } from "@/components/static/static-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What G12 News collects (very little), how cookies and analytics are handled, and your choices.",
  alternates: { canonical: "/privacy" },
};

const UPDATED = "21 September 2026";

export default function PrivacyPage() {
  return (
    <StaticPage
      title="Privacy Policy"
      intro="G12 News keeps what it collects about you to a minimum. There are no accounts, no comments, no advertising and no tracking cookies. This page explains what little we do collect and what may change."
      updated={UPDATED}
    >
      <Callout>
        <strong>In short:</strong> we do not ask you for personal information to read the site, we do not set cookies or use your browser&rsquo;s storage, and we do not use analytics or advertising services today. If that changes, this
        page changes first.
      </Callout>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Server logs.</strong> Like almost every website, the servers that deliver G12 News record technical details of each request: your IP address, the type of browser and device, the page requested and the time. This is used
          to keep the site running, to fix problems and to protect it from abuse. It is kept by our hosting provider for a limited period.
        </li>
        <li>
          <strong>Story view counts.</strong> When a story page is opened, we add one to that story&rsquo;s view counter, which decides what appears under &ldquo;Trending Now&rdquo;. The counter is a single number for the story. It is not
          linked to you, and we do not store your IP address or any identifier for it.
        </li>
        <li>
          <strong>What you search for.</strong> The words you type into search are sent to our server so it can find stories. We do not save them, but the words can appear in ordinary server logs (the address of a search results page
          contains them).
        </li>
        <li>
          <strong>Messages you send us.</strong> If you email us, we keep your message and address so we can read and answer it.
        </li>
      </ul>

      <h2>Cookies and similar technologies</h2>
      <p>
        G12 News does not currently set cookies, and it does not use local storage or similar technology in your browser to recognize you or track you across visits. Your browser may still keep ordinary cached copies of pages and pictures to make the site
        faster; that stays on your device.
      </p>
      <p>
        <strong>Analytics and advertising.</strong> We may in future add website analytics (to count visits) or advertising (for example through an ad network such as Google AdSense). Those services normally use cookies or similar
        technology to measure traffic and to show ads, and the companies behind them would process some of your data. Before we add any of them, we will describe them on this page, and where the law requires it we will ask for your consent
        first.
      </p>

      <h2>Other websites and pictures</h2>
      <ul>
        <li>
          <strong>Links to the original outlets.</strong> Each story links to the outlet that reported it. Once you follow a link you are on that outlet&rsquo;s site, and its own privacy policy and cookies apply, not ours.
        </li>
        <li>
          <strong>Pictures.</strong> Most story pictures come from the original outlet and are fetched and resized by our server before you see them. Some are loaded straight from the outlet&rsquo;s own server, which means that outlet can
          see your IP address and browser type, as it would for any picture.
        </li>
        <li>
          <strong>Share buttons and social links.</strong> These are plain links. Nothing from Facebook, X, WhatsApp or any other network is loaded until you click one, and then that network&rsquo;s own policy applies.
        </li>
        <li>
          <strong>Fonts.</strong> The site&rsquo;s fonts are served from our own address, not from a font provider.
        </li>
      </ul>

      <h2>Children</h2>
      <p>G12 News is a general news site and is not directed at children. We do not knowingly collect personal information from children.</p>

      <h2>Your choices and rights</h2>
      <p>
        Because we hold almost no information about you, there is very little to look up or delete. Depending on where you live, you may have rights over personal data, such as asking what we hold about you, asking us to correct or erase it, or
        objecting to how it is used. To use any of them, or to ask a question about this policy, <Link href="/contact">contact us</Link>.
      </p>

      <h2>Security and keeping data</h2>
      <p>
        We keep the information above only as long as we need it for the purposes described, and we rely on our hosting provider&rsquo;s security measures to protect the servers. No system is perfectly secure, so we cannot promise
        absolute security.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We will update this page when what we do changes, in particular before any analytics or advertising is added, and change the &ldquo;Last updated&rdquo; date below. Please check it from time to time.
      </p>
    </StaticPage>
  );
}
