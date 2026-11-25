import { createContext, type MouseEvent } from "react";
import { HTML_ID_PREFIX } from "./html/htmlAllowlist";

/**
 * Markdown の外部リンク（http・https。読み直した URL）を押したときに開く口（ここはドメインを知らない。中身は App・別ウィンドウが
 * foundation/ui/external の LinkOpenerProvider で入れる）。ないときは押しても何もしない（新しいウィンドウの要求ではメインプロセスは開かない）
 */
export type MarkdownLinkOpener = (e: MouseEvent, href: string, text: string) => void;

export const MarkdownLinkOpenerContext = createContext<MarkdownLinkOpener | null>(null);

/** 押したリンクのまわりの Markdown の表示（返答 1 つ）。行き先を探す範囲 */
const MARKDOWN_ROOT = ".markdown";

/**
 * # で始まるリンク（脚注の番号・戻る印・[見出し](#…)）を押したとき: 窓を開かず（URL の hash も変えない。アプリのルーターが使う）、
 * 押したリンクに近い Markdown の表示（返答 1 つ）の中に行き先の ID があれば、そこへスクロールする。なければ何もしない。
 * 返答が 2 つ並んでも、ID（remark-rehype の user-content-…）は返答ごとに同じなので、ほかの返答の中は探さない
 */
export function scrollToFragment(anchor: Element, id: string): void {
  const root = anchor.closest(MARKDOWN_ROOT);
  // Markdown の中の HTML の id は頭（HTML_ID_PREFIX）を付けて描くので、Markdown のリンクの #x はその形も探す（HTML のリンクは初めから頭付き）
  const target = root?.querySelector(`#${CSS.escape(id)}`) ?? (id.startsWith(HTML_ID_PREFIX) ? null : root?.querySelector(`#${CSS.escape(HTML_ID_PREFIX + id)}`));
  target?.scrollIntoView({ block: "start" });
}

/** hast の要素の中の文字（リンクの文字。確認の画面で「文字と行き先が違う」を見分ける） */
export function linkTextOf(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; value?: unknown; children?: unknown[] };
  if (n.type === "text" && typeof n.value === "string") return n.value;
  return (n.children ?? []).map(linkTextOf).join("");
}
