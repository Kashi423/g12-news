import { toParagraphs } from "@/lib/article/paragraphs";

/** The AI-written summary as short paragraphs (see toParagraphs). Falls back to the excerpt if a story somehow has no body. */
export function ArticleBody({ body, fallback }: { body: string; fallback: string }) {
  const paragraphs = toParagraphs(body);
  if (paragraphs.length === 0) paragraphs.push(fallback);
  return (
    <div data-testid="article-body" className="mt-6 space-y-5 text-[1.0625rem] leading-[1.8] text-ink sm:text-lg sm:leading-[1.8]">
      {paragraphs.map((text, index) => (
        <p key={index}>{text}</p>
      ))}
    </div>
  );
}
