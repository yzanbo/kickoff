// 木にしたあとの 2 回目の確かめ: HTML から作った要素（data.kickoffHtml）のタグ・属性・値を、もう一度一覧（htmlAllowlist.ts）と照らす。
// 読み取り（htmlTokens.ts・htmlTree.ts）に誤りがあっても、一覧にないものは描かない。
// Kickoff が付ける印（md-html のクラス・ファイルのチップ・数式・薄く出す段）は、この確かめのあとに付ける
import type { Element, ElementContent, Root } from "hast";
import { ATTRIBUTE_BY_PROP, HTML_ATTRIBUTES, HTML_ID_PREFIX, HTML_TAGS } from "./htmlAllowlist";
import { buildHtml } from "./htmlTree";

/** HTML から作った要素に付けるクラス（Markdown.css の「ほかの CSS を当てない決まり」と見た目の相手） */
export const HTML_ELEMENT_CLASS = "md-html";


/** 木の上の属性 1 つが一覧の決まりどおりか（値は読み直して同じ形になるものだけ） */
function propertyFits(tag: string, prop: string, value: unknown): boolean {
  if (tag === "font" || !Object.hasOwn(ATTRIBUTE_BY_PROP, prop)) return false;
  const rule = HTML_ATTRIBUTES[ATTRIBUTE_BY_PROP[prop]];
  if (rule.tags && !rule.tags.has(tag)) return false;
  if (typeof value === "boolean") return value && rule.parse(null) === true;
  if (typeof value !== "string" && typeof value !== "number") return false;
  const raw = String(value);
  if (prop === "id") return raw.startsWith(HTML_ID_PREFIX) && rule.parse(raw) === raw;
  return rule.parse(raw) === value;
}

/** HTML から作った要素を確かめる（一覧にないタグは外して中身だけ、合わない属性は消す）。その場で書き換える */
export function verifyHtml(parent: Root | Element): void {
  let changed = false;
  const next: ElementContent[] = [];
  for (const child of parent.children as ElementContent[]) {
    if (child.type === "raw") {
      // 読み取りのあとに raw は残らない。残っていても描かない
      changed = true;
      continue;
    }
    if (child.type !== "element") {
      next.push(child);
      continue;
    }
    verifyHtml(child);
    if (child.data?.kickoffHtml) {
      if (!HTML_TAGS.has(child.tagName) || child.tagName === "rp") {
        next.push(...child.children);
        changed = true;
        continue;
      }
      for (const prop of Object.keys(child.properties)) {
        if (!propertyFits(child.tagName, prop, child.properties[prop])) delete child.properties[prop];
      }
    }
    next.push(child);
  }
  if (changed) parent.children = next;
}

/** summary が空（文字も画像もない）か */
const isEmptySummary = (node: ElementContent): boolean =>
  node.type === "text" ? node.value.trim() === "" : node.type === "element" ? node.tagName !== "img" && node.children.every(isEmptySummary) : true;

/** 見出しのないたたむ部分に「詳細」と出す（summary がない・空なら、ブラウザの既定の英語の文言でなく日本語で） */
function ensureSummary(details: Element) {
  const label = { type: "text", value: DETAILS_LABEL } as const;
  const first = details.children.find((c) => !(c.type === "text" && c.value.trim() === ""));
  if (first?.type === "element" && first.tagName === "summary") {
    if (isEmptySummary(first)) first.children = [label];
    return;
  }
  details.children.unshift({ type: "element", tagName: "summary", properties: {}, children: [label], data: { kickoffHtml: true } });
}

/** summary がない・空のたたむ部分の見出し */
const DETAILS_LABEL = "詳細";

/** 確かめたあとに付ける Kickoff の印（HTML から作った要素に md-html のクラス・たたむ部分の見出し） */
function decorateHtml(parent: Root | Element): void {
  for (const child of parent.children) {
    if (child.type !== "element") continue;
    if (child.data?.kickoffHtml && child.tagName === "details") ensureSummary(child);
    if (child.data?.kickoffHtml) child.properties.className = [HTML_ELEMENT_CLASS];
    decorateHtml(child);
  }
}

/**
 * Markdown の中の HTML を描く形にする（読む → 2 回目の確かめ → 印を付ける。その場で書き換える）。
 * 上限を超えたブロックは false（呼ぶ側が、Markdown として描かずに書いたままの文字で出す）
 */
export function applyMarkdownHtml(tree: Root): boolean {
  if (!buildHtml(tree)) return false;
  verifyHtml(tree);
  decorateHtml(tree);
  return true;
}
