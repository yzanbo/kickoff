// ノートの Markdown のリンクのうち、行き先のあるもの（返答の表示がリンクとして描くもの）を見分ける純粋な関数。
// 編集の画面の読み取り（@lezer/markdown）は、定義のない [文字]（[2, 3]・⌘[ ⌘] など）もリンクの節にする。
// 返答の表示（micromark）は定義のある参照だけをリンクにするので、同じ決まりで見分けて、定義のないものは文字のまま見せる
import type { SyntaxNode, Tree } from "@lezer/common";

/** 参照の名前を、定義と引き当てる形にそろえる（CommonMark と同じ: 空白をまとめ、前後を落とし、大文字・小文字を区別しない） */
export function normalizeLabel(label: string): string {
  return label.replace(/[\t\n\r ]+/g, " ").trim().toLowerCase().toUpperCase();
}

/** 脚注の名前（[^1]）か（脚注は別の書き方。リンクの定義・参照として数えない） */
const isFootnoteLabel = (label: string) => label.startsWith("^");

/** 入れ子にリンクの定義が入りうる、まとまりの節（文の中は探さない） */
const CONTAINERS = new Set(["Document", "Blockquote", "BulletList", "OrderedList", "ListItem"]);

const definitionsByTree = new WeakMap<Tree, Map<string, string>>();

/**
 * リンクの定義（[名前]: URL）の一覧（そろえた名前 → URL）。同じ名前は先に書いたものが勝つ（CommonMark と同じ）。
 * 文の中まではたどらない（定義はまとまりの直下にしか書けない）。同じ木には同じ結果を返す
 */
export function linkDefinitions(tree: Tree, text: string): Map<string, string> {
  const known = definitionsByTree.get(tree);
  if (known) return known;
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
  definitionsByTree.set(tree, defs);
  return defs;
}

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
