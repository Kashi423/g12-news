import { jsonLdString } from "@/lib/seo/json-ld";

/** A schema.org structured-data block for search engines. Renders nothing visible. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
