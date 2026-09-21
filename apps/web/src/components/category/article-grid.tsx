import type { HomeArticle } from "@/lib/home/types";
import { ArticleCard } from "../home/article-card";

/**
 * A page of stories, using the same ArticleCard as the homepage. One column on phones, two on
 * tablets and small laptops, three where the width allows once the sidebar has taken its share.
 */
export function ArticleGrid({ articles }: { articles: readonly HomeArticle[] }) {
  return (
    <ul data-testid="category-articles" className="grid gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
      {articles.map((article, index) => (
        <li key={article.id}>
          <ArticleCard article={article} headingLevel="h2" eager={index === 0} />
        </li>
      ))}
    </ul>
  );
}
