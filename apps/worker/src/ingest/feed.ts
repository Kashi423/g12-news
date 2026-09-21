import { normalizeImageUrl } from "@g12/config";
import Parser from "rss-parser";
import type { IngestSettings } from "../settings";
import { decodeEntities, htmlToText, truncate } from "./text";

export interface FeedItem {
  title: string;
  url: string;
  /** Best available description, as plain text (may be empty). */
  snippet: string;
  publishedAt: Date | null;
  imageUrl: string | null;
  /** Photographer or agency the feed credited for the image (Media RSS), or null/absent when it named nobody. */
  imageCredit?: string | null;
}

interface MediaNode {
  $?: { url?: string };
  // Media RSS lets <media:content> carry its own credit and copyright lines (xml2js gives arrays).
  "media:credit"?: unknown[];
  "media:copyright"?: unknown[];
}
interface CustomItem {
  mediaContent?: MediaNode[];
  mediaThumbnail?: MediaNode[];
  /** <media:credit> / <media:copyright> directly under the item. */
  mediaCredit?: unknown[];
  mediaCopyright?: unknown[];
  /** <content:encoded>: often the full article, while <description> is a short teaser. */
  contentEncoded?: string;
}

const parser = new Parser<Record<string, never>, CustomItem>({
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["media:credit", "mediaCredit", { keepArray: true }],
      ["media:copyright", "mediaCopyright", { keepArray: true }],
      ["content:encoded", "contentEncoded"],
    ],
  },
});

const MAX_SNIPPET_CHARS = 3000;
const MAX_CREDIT_CHARS = 120;

/**
 * Real-world feeds are often not well-formed XML (bare "&" in URLs, control characters).
 * A strict parser rejects the whole feed over one such character, so repair those first.
 */
export function sanitizeXml(xml: string): string {
  return xml
    .replace(/^﻿/, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;");
}

function httpUrl(value: string | undefined | null): string | null {
  if (!value || value.length > 2000) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The story's picture, with known feed quirks fixed (see normalizeImageUrl) so the stored URL actually loads. */
function pickImage(item: Parser.Item & CustomItem): string | null {
  return normalizeImageUrl(pickRawImage(item));
}

function pickRawImage(item: Parser.Item & CustomItem): string | null {
  const enclosure = item.enclosure;
  if (enclosure?.url && (enclosure.type?.startsWith("image/") || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(enclosure.url))) {
    const url = httpUrl(enclosure.url);
    if (url) return url;
  }
  for (const node of [...(item.mediaContent ?? []), ...(item.mediaThumbnail ?? [])]) {
    const url = httpUrl(node.$?.url);
    if (url && !/\.(mp4|webm|mp3)(\?|$)/i.test(url)) return url;
  }
  const inline = /<img\b[^>]*?\bsrc=["']([^"']+)["']/i.exec(`${item.contentEncoded ?? ""} ${item.content ?? ""}`);
  return httpUrl(inline?.[1] ? decodeEntities(inline[1]) : null);
}

/** Text of an XML node that may or may not carry attributes: "Reuters", or { _: "Reuters", $: { role: "photographer" } }. */
function nodeText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(nodeText).find((text) => text.trim()) ?? "";
  if (value && typeof value === "object" && typeof (value as { _?: unknown })._ === "string") return (value as { _: string })._;
  return "";
}

/** Feeds fill the credit field with placeholders as often as with names. */
const NO_CREDIT = /^(n\/?a|none|null|unknown|anonymous|-+)$/i;

/**
 * A credit line ready to show ("Photo: " is added by the page, so a leading label is dropped here).
 * Null when it is empty, a placeholder, or a bare link rather than a name.
 */
export function cleanImageCredit(raw: string): string | null {
  const text = decodeEntities(htmlToText(raw))
    .replace(/\s+/g, " ")
    .replace(/^(?:photo|image|picture|credit|source)\s*:\s*/i, "")
    .trim();
  if (text.length < 2 || NO_CREDIT.test(text) || /^https?:\/\//i.test(text)) return null;
  return truncate(text, MAX_CREDIT_CHARS - 1); // truncate() adds a "…", so this keeps the total within the cap
}

/** The credit the feed gave for the story's picture: on the item itself, or on its media node. */
function pickImageCredit(item: Parser.Item & CustomItem): string | null {
  const nodes = [...(item.mediaContent ?? []), ...(item.mediaThumbnail ?? [])];
  const candidates = [
    ...(item.mediaCredit ?? []),
    ...nodes.flatMap((node) => node["media:credit"] ?? []),
    ...(item.mediaCopyright ?? []),
    ...nodes.flatMap((node) => node["media:copyright"] ?? []),
  ];
  for (const candidate of candidates) {
    const credit = cleanImageCredit(nodeText(candidate));
    if (credit) return credit;
  }
  return null;
}

/** The richest description the item offers, as plain text. */
function pickSnippet(item: Parser.Item & CustomItem): string {
  const texts = [item.contentEncoded, item.content, item.contentSnippet, item.summary].map((html) => htmlToText(html ?? ""));
  return truncate(texts.reduce((best, text) => (text.length > best.length ? text : best), ""), MAX_SNIPPET_CHARS);
}

/** Parse feed XML (RSS or Atom) into normalized items. Items without a title or link are dropped. */
export async function parseFeedXml(xml: string): Promise<FeedItem[]> {
  const feed = await parser.parseString(sanitizeXml(xml));
  const items: FeedItem[] = [];
  for (const item of feed.items ?? []) {
    const title = decodeEntities(htmlToText(item.title ?? "")).trim();
    const url = httpUrl(item.link) ?? httpUrl(item.guid);
    if (!title || !url) continue;
    const published = Date.parse(item.isoDate ?? item.pubDate ?? "");
    const imageUrl = pickImage(item);
    items.push({
      title,
      url,
      snippet: pickSnippet(item),
      publishedAt: Number.isNaN(published) ? null : new Date(published),
      imageUrl,
      // A credit belongs to a picture: with no picture there is nothing to credit.
      imageCredit: imageUrl ? pickImageCredit(item) : null,
    });
  }
  return items;
}

export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as Error & { cause?: { code?: string; message?: string } }).cause;
  const detail = cause?.code ?? cause?.message;
  const message = error.name === "TimeoutError" ? "timed out" : error.message.split("\n")[0]!;
  return detail ? `${message} (${detail})` : message;
}

/** Download and parse one feed. Throws a short, readable Error on any failure. */
export async function fetchFeed(url: string, settings: Pick<IngestSettings, "userAgent" | "fetchTimeoutMs" | "maxFeedBytes">): Promise<FeedItem[]> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": settings.userAgent,
      Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5",
    },
    signal: AbortSignal.timeout(settings.fetchTimeoutMs),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const declared = Number(response.headers.get("content-length"));
  if (declared > settings.maxFeedBytes) throw new Error(`feed too large (${declared} bytes)`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > settings.maxFeedBytes) throw new Error(`feed too large (${bytes.byteLength} bytes)`);

  const xml = new TextDecoder("utf-8").decode(bytes);
  if (/^\s*(<!doctype html|<html)/i.test(xml)) throw new Error("response is an HTML page, not a feed");
  try {
    return await parseFeedXml(xml);
  } catch (error) {
    throw new Error(`could not parse feed: ${describeError(error).replace(/\s+/g, " ").slice(0, 80)}`);
  }
}
