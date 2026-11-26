import { createContext, type MouseEvent } from "react";
import { linkTargetOf } from "@shared/foundation/linkTarget";
import { SEE_THROUGH_CLASS } from "@shared/foundation/math/katexSettings";
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

/**
 * 本文のリンクを押したとき（Markdown のリンクと GitHub の本文で同じ）。左・中クリックなら窓の既定の動き（窓の移動・新しいウィンドウ）を止め、
 * 行き先の判定（linkTargetOf）を通った外のページは開く口（確認の画面）で、# は本文の中へスクロールする。
 * anchor: 押したリンク（なければ何もしない）。textOf: 確認の画面に渡すリンクの文字（開くときだけ読む）
 */
export function pressLink(e: MouseEvent, anchor: Element | null, opener: MarkdownLinkOpener | null, textOf: () => string): void {
  if ((e.button !== 0 && e.button !== 1) || e.defaultPrevented || !anchor) return;
  e.preventDefault();
  const target = linkTargetOf(anchor.getAttribute("href"));
  if (target?.kind === "web") opener?.(e, target.url, textOf());
  else if (target?.kind === "fragment") scrollToFragment(anchor, target.id);
}

/** 画面に出ない数式の部分（読み上げ用の MathML・書いた式の annotation）と、透明な数式の文字のクラス */
const UNSEEN_MATH_CLASSES = ["katex-mathml", SEE_THROUGH_CLASS];

/**
 * hast の要素の中の、画面に見える文字（リンクの文字。確認の画面で「文字と行き先が違う」を見分ける）。
 * 画像は alt も数える（読めない画像は alt が文字で出て、リンクの色で見えるため）。数式は見た目の部分だけを読む
 * （読み上げ用の MathML と書いた式も読むと、\text{apple.com} が「apple.com\text{apple.com}apple.com」とつながってドメインに読めないため）
 */
export function linkTextOf(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; tagName?: string; value?: unknown; properties?: { alt?: unknown; className?: unknown }; children?: unknown[] };
  if (n.type === "text" && typeof n.value === "string") return n.value;
  if (n.type === "element") {
    // 画像の alt は前後の文字とつながらないよう空白で区切る
    if (n.tagName === "img") return typeof n.properties?.alt === "string" ? ` ${n.properties.alt} ` : "";
    if (n.tagName === "annotation" || n.tagName === "math") return "";
    const classes = n.properties?.className;
    if (Array.isArray(classes) && classes.some((c) => UNSEEN_MATH_CLASSES.includes(String(c)))) return "";
  }
  return (n.children ?? []).map(linkTextOf).join("");
}

/** DOM の節の口（Node の一部。テストでは偽の木を渡す） */
export interface LinkDomNode {
  readonly nodeType: number;
  readonly nodeValue: string | null;
  readonly localName?: string;
  readonly childNodes: ArrayLike<LinkDomNode>;
  getAttribute?(name: string): string | null;
}

/** DOM の節を、linkTextOf が読む hast の形にする（文字・要素のタグの名前・alt・クラス・子だけ） */
function hastOf(node: LinkDomNode): unknown {
  if (node.nodeType === 3) return { type: "text", value: node.nodeValue ?? "" };
  if (node.nodeType !== 1) return { type: "comment" };
  const className = (node.getAttribute?.("class") ?? "").split(/\s+/).filter(Boolean);
  return { type: "element", tagName: node.localName, properties: { alt: node.getAttribute?.("alt") ?? undefined, className }, children: Array.from(node.childNodes, hastOf) };
}

/** DOM に入れて描いた HTML（GitHub の本文など）のリンクの、画面に見える文字（linkTextOf と同じ決まり。画像の alt も数える） */
export const domLinkTextOf = (anchor: LinkDomNode): string => linkTextOf(hastOf(anchor));
