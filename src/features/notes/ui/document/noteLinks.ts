// ノートの Markdown のリンクのうち、行き先のあるもの（返答の表示がリンクとして描くもの）を見分ける純粋な関数。
// 編集の画面の読み取り（@lezer/markdown）は、定義のない [文字]（[2, 3]・⌘[ ⌘] など）もリンクの節にする。
// 返答の表示（micromark）は定義のある参照だけをリンクにするので、同じ決まりで見分けて、定義のないものは文字のまま見せる
import type { SyntaxNode, Tree } from "@lezer/common";
import { isUrlStop } from "@/foundation/ui/markdown/syntax/urlStop";
import { cacheByTree } from "./treeCache";

/** 参照の名前を、定義と引き当てる形にそろえる（CommonMark と同じ: 空白をまとめ、前後を落とし、大文字・小文字を区別しない） */
export function normalizeLabel(label: string): string {
  return label.replace(/[\t\n\r ]+/g, " ").trim().toLowerCase().toUpperCase();
}

/** 脚注の名前（[^1]）か（脚注は別の書き方。リンクの定義・参照として数えない） */
const isFootnoteLabel = (label: string) => label.startsWith("^");

/** 入れ子にリンクの定義が入りうる、まとまりの節（文の中は探さない） */
const CONTAINERS = new Set(["Document", "Blockquote", "BulletList", "OrderedList", "ListItem"]);

/**
 * リンクの定義（[名前]: URL）の一覧（そろえた名前 → URL）。同じ名前は先に書いたものが勝つ（CommonMark と同じ）。
 * 文の中まではたどらない（定義はまとまりの直下にしか書けない）。同じ木と文には同じ結果を返す
 */
export const linkDefinitions = cacheByTree((tree: Tree, text: string): Map<string, string> => {
  const defs = new Map<string, string>();
  const walk = (node: SyntaxNode) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name === "LinkReference") {
        const label = child.getChild("LinkLabel");
        const url = child.getChild("URL");
        const name = label ? text.slice(label.from + 1, label.to - 1) : "";
        const key = normalizeLabel(name);
        if (key && !isFootnoteLabel(name) && !defs.has(key)) defs.set(key, url ? text.slice(url.from, url.to) : "");
      } else if (CONTAINERS.has(child.name)) walk(child);
    }
  };
  walk(tree.topNode);
  return defs;
});

/**
 * Link の節が指す行き先（書いたままの URL。空の () は空文字）。行き先のないもの（定義のない [文字]・脚注の [^1]）は null。
 * 形: [文](URL) / [文]() / [文][名前] / [文][] / [名前]
 */
export function linkHref(node: SyntaxNode, text: string, defs: Map<string, string>): string | null {
  let inline = false;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === "LinkMark" && text.slice(child.from, child.to) === "(") inline = true;
  }
  if (inline) {
    const url = node.getChild("URL");
    return url ? text.slice(url.from, url.to) : "";
  }
  const label = node.getChild("LinkLabel");
  // [文][] と [名前] は、[ ] の中の文を名前にする
  const ownText = () => {
    const marks = node.getChildren("LinkMark");
    return marks.length >= 2 ? text.slice(marks[0].to, marks[1].from) : "";
  };
  const labelText = label && label.to - label.from > 2 ? text.slice(label.from + 1, label.to - 1) : ownText();
  if (isFootnoteLabel(labelText)) return null;
  return defs.get(normalizeLabel(labelText)) ?? null;
}

/** URL のそのまま書きの終わり（返答の表示と同じく、日本語の文の記号・ひらがなの手前で終える。urlStop） */
export function bareUrlEnd(text: string, from: number, to: number): number {
  let pos = from;
  for (const ch of text.slice(from, to)) {
    if (isUrlStop(ch.codePointAt(0) ?? null)) break;
    pos += ch.length;
  }
  return pos;
}

/** 文の中のリンク 1 つ（範囲・行き先・見える文字） */
export interface NoteLinkAt {
  from: number;
  to: number;
  href: string;
  /** リンクの見える文字（[文](URL) の文。URL のそのまま書きは URL） */
  text: string;
}

/** URL のそのまま書きか（リンク・画像・定義・<URL> の中の URL を除く） */
export const isBareUrl = (node: SyntaxNode) => node.name === "URL" && !["Link", "Image", "LinkReference", "Autolink"].includes(node.parent?.name ?? "");

/** pos にあるリンク（行き先のあるものだけ。なければ null） */
export function linkAt(tree: Tree, text: string, pos: number): NoteLinkAt | null {
  const defs = linkDefinitions(tree, text);
  for (let node: SyntaxNode | null = tree.resolveInner(pos, 0); node; node = node.parent) {
    if (node.name === "Link") {
      const href = linkHref(node, text, defs);
      if (href === null) return null;
      const marks = node.getChildren("LinkMark");
      const label = marks.length >= 2 ? text.slice(marks[0].to, marks[1].from) : text.slice(node.from, node.to);
      return { from: node.from, to: node.to, href, text: label };
    }
    if (node.name === "Autolink") {
      const url = node.getChild("URL");
      const href = url ? text.slice(url.from, url.to) : "";
      return href ? { from: node.from, to: node.to, href, text: href } : null;
    }
    if (isBareUrl(node)) {
      const end = bareUrlEnd(text, node.from, node.to);
      if (pos > end) return null;
      const href = text.slice(node.from, end);
      return { from: node.from, to: end, href, text: href };
    }
  }
  return null;
}
