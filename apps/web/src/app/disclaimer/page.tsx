import type { Metadata } from "next";
import Link from "next/link";
import { Callout, StaticPage } from "@/components/static/static-page";

export const metadata: Metadata = {
  title: "Disclaimer",
  description: "How G12 News uses and credits other outlets' reporting: AI-written summaries with a link to the original in every story. G12 News does not claim original reporting.",
  alternates: { canonical: "/disclaimer" },
};

const UPDATED = "21 September 2026";

export default function DisclaimerPage() {
  return (
    <StaticPage
      title="Disclaimer"
      intro="G12 News summarizes news that other outlets have reported, and always says where it came from. This page explains, in plain language, how that works and what it means for you."
      updated={UPDATED}
    >
      <Callout testId="site-disclaimer">
        <strong>G12 News is an automated aggregator. Stories are AI-summarized from the original outlets linked in each article.</strong>
      </Callout>

      <h2>We do not claim original reporting</h2>
      <p>
        G12 News does not report the news itself. The facts, quotes, pictures and analysis in the stories you read here were first published by the outlets we name. The words of each summary are written by an AI; the reporting behind them is the
        original outlet&rsquo;s work and belongs to that outlet. G12 News is not affiliated with, endorsed by or sponsored by any outlet we summarize.
      </p>

      <h2>How stories are made and credited</h2>
      <ul>
        <li>An automated system reads the public news feeds of the outlets we follow.</li>
        <li>An AI is given only the outlet&rsquo;s headline and its short description. It writes a short summary in its own words; it is told to use only facts that are in what it was given.</li>
        <li>Automatic checks stop a summary from being published if it repeats a run of the outlet&rsquo;s own wording or is the wrong length. We do not keep the outlet&rsquo;s text: only the summary is stored.</li>
        <li>
          Every story shows the outlet&rsquo;s name and a link to the original report, in a box directly after the summary. The link opens the outlet&rsquo;s own page in a new tab and does not pass on search-ranking credit
          (<code>rel=&quot;nofollow noopener noreferrer&quot;</code>).
        </li>
        <li>
          The byline on every story is &ldquo;G12 News Desk&rdquo;: no human reporter is named, because no human reporter wrote it. The story itself does not carry an &ldquo;AI-generated&rdquo; label &mdash; that is disclosed here, on this
          page, instead.
        </li>
      </ul>

      <h2>Accuracy</h2>
      <p>
        Summaries are written by an AI and are not checked by a person before they appear. They can be incomplete, out of date or wrong &mdash; for example a mistaken name, number, date or day. We try to catch copied text automatically, but we cannot
        automatically catch every error of fact. Whether a story is marked as urgent or breaking is also decided by the AI.
      </p>
      <p>
        <strong>Do not rely on a G12 News summary for anything that matters.</strong> Read the original report, linked in every story. If you spot a mistake, please tell us through the <Link href="/contact">contact page</Link>.
      </p>

      <h2>Pictures and copyright</h2>
      <p>
        Pictures shown with stories belong to their owners: the outlet, a news agency or a photographer. Where the outlet&rsquo;s feed names a photographer or agency, we show that credit under the picture. If you own something shown on G12 News and
        want it removed, or you are an outlet that would like a summary of your reporting taken down, <Link href="/contact">contact us</Link> with the address of the page and we will look at it promptly.
      </p>

      <h2>Not advice</h2>
      <p>
        The stories on G12 News are general news information. Nothing here is legal, financial, medical or other professional advice, and nothing here should be used to make decisions about your money, health or legal position. Ask a qualified
        professional.
      </p>

      <h2>Links to other websites</h2>
      <p>
        We link to the original outlets and to sites such as Facebook, X and WhatsApp. We do not control those sites and are not responsible for what they publish or for how they treat your information. Read <Link href="/privacy">our privacy policy</Link>{" "}
        for what we do collect.
      </p>

      <h2>Changes</h2>
      <p>We may update this page as the site changes. The date at the bottom shows when it was last changed.</p>
    </StaticPage>
  );
}
