import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORIES, categoryPath, SOURCES } from "@g12/config";
import { Callout, StaticPage } from "@/components/static/static-page";

export const metadata: Metadata = {
  title: "About",
  description: "G12 News is an AI-automated news aggregator: it summarizes reporting from Pakistani and international outlets and links to the original in every story.",
  alternates: { canonical: "/about" },
};

// The outlets we read are the ones in the starter feed list, so this page can never drift from what the newsroom does.
const OUTLETS = [...new Set(SOURCES.map((source) => source.outlet))].sort((a, b) => a.localeCompare(b));

export default function AboutPage() {
  return (
    <StaticPage
      title="About G12 News"
      intro="G12 News is an AI-automated news aggregator for Pakistan and the world. It has no reporters or editors writing the stories you read here: every story is a short summary, written by an AI, of reporting first published by another news outlet, and every story links back to that original."
    >
      <h2>What G12 News is</h2>
      <p>
        We follow the public news feeds of well-known Pakistani and international outlets, all day, and turn what they publish into short, easy-to-scan summaries under one roof. The site is updated continuously: new stories appear as
        the outlets publish them, without anyone here writing or approving each one.
      </p>
      <p>
        We do not do original reporting. We do not send anyone to cover events, we do not interview people, and we do not take pictures. What we do is summarize, sort and link, so you can see what is happening across {CATEGORIES.length} sections
        &mdash; {CATEGORIES.map((category) => category.name).join(", ")} &mdash; and follow any story to the outlet that reported it.
      </p>

      <h2>How a story gets here</h2>
      <ol>
        <li>
          <strong>We check the feeds.</strong> Throughout the day, our system reads the public news feeds of the outlets listed below.
        </li>
        <li>
          <strong>We screen the items.</strong> Old items, stories we already have and near-identical headlines are dropped.
        </li>
        <li>
          <strong>An AI writes the summary.</strong> Only the outlet&rsquo;s headline and its short description are given to the AI. It writes a brief in its own words, chooses a section and topic tags, and rates how urgent the story is.
        </li>
        <li>
          <strong>Automatic checks run.</strong> A summary that repeats a run of the outlet&rsquo;s own wording, or is too short or too long, is not published.
        </li>
        <li>
          <strong>The story goes live with its source.</strong> Every story shows the outlet&rsquo;s name, a clearly marked link to the original report, and an &ldquo;AI-generated&rdquo; label. Stories the AI judges to be urgent and very recent are marked as breaking news.
        </li>
      </ol>

      <h2>Where the news comes from</h2>
      <p>We currently summarize reporting from these outlets. We are not affiliated with any of them, and each story links to the outlet&rsquo;s own page.</p>
      <ul data-testid="about-outlets">
        {OUTLETS.map((outlet) => (
          <li key={outlet}>{outlet}</li>
        ))}
      </ul>

      <h2>What to keep in mind</h2>
      <p>
        An AI wrote every summary, and no human checks each one before it appears. AI can get details wrong: a name, a number, a date, or which day something happened. The summaries are a quick way to see what is going on, not a substitute for the
        original report. <strong>For anything that matters, read the original story</strong>; the link is in a box right after each summary.
      </p>
      <Callout>
        If you find a mistake, tell us. Send us the address of the story and what is wrong through the <Link href="/contact">contact page</Link>, and we will look at it.
      </Callout>

      <h2>What we do not do</h2>
      <ul>
        <li>We do not claim to report the news ourselves, and we never invent a reporter&rsquo;s name. The byline on every story is &ldquo;G12 News Desk&rdquo;, and the story says plainly that an AI wrote it.</li>
        <li>We do not copy outlets&rsquo; articles. We publish short summaries in new words and send readers to the original.</li>
        <li>We have no comment sections, because nobody moderates them.</li>
      </ul>

      <h2>More</h2>
      <p>
        Read our <Link href="/disclaimer">disclaimer</Link> for the full picture of how we use and credit other outlets&rsquo; reporting, our <Link href="/privacy">privacy policy</Link>, or browse the sections, starting with{" "}
        <Link href={categoryPath("pakistan")}>Pakistan</Link>.
      </p>
    </StaticPage>
  );
}
