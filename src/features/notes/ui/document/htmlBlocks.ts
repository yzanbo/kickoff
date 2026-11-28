// ノートの中の HTML のまとまり（<details>・<div> など）を見つける純粋な関数。返答の表示と同じく、入れ物のタグは
// 開きから閉じまでを 1 つにまとめる（空行をはさんでも。中の Markdown も一緒に描く）。閉じないまま長く続くものはまとめない
import type { SyntaxNode, Tree } from "@lezer/common";
import { HTML_TAGS, VOID_TAGS } from "@/foundation/ui/markdown/html/htmlAllowlist";
import { cacheByTree } from "./treeCache";

/** HTML のまとまり 1 つ（行の頭から行の終わりまで） */
export interface HtmlBlockSource {
  from: number;
  to: number;
  source: string;
}

/** まとめる長さの上限（返答の表示のブロック分けと同じ） */
const GROUP_LIMIT = 32000;

/** まとまりが入りうる所（文の中は探さない） */
const CONTAINERS = new Set(["Document", "BulletList", "OrderedList", "ListItem"]);

/** 開きのタグから、同じ名前の閉じのタグまでの終わり（行の終わり。閉じなければ null） */
function groupEnd(text: string, from: number, name: string): number | null {
  const pattern = new RegExp(`<(/?)${name}(?=[\\s>/])[^>]*>`, "gi");
  pattern.lastIndex = from;
  let depth = 0;
  for (let m = pattern.exec(text); m && m.index - from < GROUP_LIMIT; m = pattern.exec(text)) {
    // 自分で閉じる <name /> は数えない
    if (!m[1] && m[0].endsWith("/>")) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) {
      const end = text.indexOf("\n", m.index + m[0].length);
      return end < 0 ? text.length : end;
    }
  }
  return null;
}

/** 文の中の HTML のまとまり（一覧（htmlAllowlist）の小文字のタグで始まるものだけ。HTML のコメントは除く。同じ木と文には同じ結果） */
export const htmlBlocks = cacheByTree((tree: Tree, text: string): HtmlBlockSource[] => {
  const out: HtmlBlockSource[] = [];
  let after = -1;
  const walk = (node: SyntaxNode) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.from < after) continue;
      if (child.name === "HTMLBlock") {
        const m = /^\s*<([a-z][a-z0-9-]*)\b/.exec(text.slice(child.from, child.to));
        if (!m || !HTML_TAGS.has(m[1])) continue;
        const end = VOID_TAGS.has(m[1]) ? child.to : groupEnd(text, child.from, m[1]);
        if (end === null) continue;
        const from = text.lastIndexOf("\n", child.from - 1) + 1;
        const to = Math.max(end, child.to);
        out.push({ from, to, source: text.slice(from, to) });
        after = to;
      } else if (CONTAINERS.has(child.name)) walk(child);
    }
  };
  walk(tree.topNode);
  return out;
});
