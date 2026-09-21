import type { Metadata } from "next";
import Link from "next/link";
import { Callout, StaticPage } from "@/components/static/static-page";
import { contactEmail } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach G12 News: report a mistake in a story, ask for a story or picture to be removed, or send feedback.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const email = contactEmail();

  return (
    <StaticPage title="Contact" intro="The best way to reach G12 News is by email. We read every message, but we are a small, automated operation and cannot promise a reply time.">
      <h2>Email us</h2>
      {email ? (
        <Callout testId="contact-email">
          <a href={`mailto:${email}`} className="text-lg">
            {email}
          </a>
        </Callout>
      ) : (
        <Callout testId="contact-email-missing">
          Our contact address has not been published yet. Please check back soon.
          {process.env.NODE_ENV !== "production" && (
            <span className="mt-2 block text-sm text-muted">Site owner: set CONTACT_EMAIL in .env and restart the site to show your address here.</span>
          )}
        </Callout>
      )}

      <h2>What to write to us about</h2>
      <ul>
        <li>
          <strong>A mistake in a story.</strong> Every story is written by an AI and can contain errors. Send us the web address of the story and tell us what is wrong and, if you can, what is right. Please also read the original report,
          linked in each story.
        </li>
        <li>
          <strong>A story or picture you want removed.</strong> If you own the rights to a picture, or you are an outlet and would like a summary of your reporting taken down, send us the address of the page and a short note showing that
          you are the rights holder. We will look at every request promptly.
        </li>
        <li>
          <strong>Feedback and suggestions.</strong> Something confusing, broken or missing on the site, or an outlet you think we should include.
        </li>
        <li>
          <strong>Advertising and partnerships.</strong> Questions from businesses and other publishers.
        </li>
      </ul>

      <h2>Before you write</h2>
      <p>
        We do not have reporters, so we cannot take news tips or comment on events, and we cannot confirm or update the facts of a story ourselves: the outlet named in each story is the source. To learn more about how the site works, read
        the <Link href="/about">About page</Link> and the <Link href="/disclaimer">disclaimer</Link>.
      </p>
    </StaticPage>
  );
}
