// ノートの脚注（本文の [^名前] と、行の頭の [^名前]: 注の文）を見つける純粋な関数。編集の画面の読み取り（lezer）は脚注を読まないので、
// 行の形で見つける。返答の表示と同じく、定義のある名前の印だけを脚注にし、番号は本文で初めて出てきた順
import type { Tree } from "@lezer/common";
import { normalizeLabel } from "./noteLinks";

/** 脚注の定義（行の頭の [^名前]: から、字下げした続きの行まで） */
export interface FootnoteDef {
  /** 行の頭 */
  from: number;
  /** [^名前]: の終わり（後ろの空白 1 つを含む） */
  markTo: number;
  /** 定義の終わり（続きの行の終わり） */
  to: number;
  /** 注の文（続きの行は空白 1 つでつなぐ） */
  text: string;
  /** 番号（本文で一度も指していなければ null） */
  number: number | null;
}

/** 本文の脚注の印 */
export interface FootnoteRef {
  from: number;
  to: number;
  label: string;
  number: number;
}

export interface Footnotes {
  /** そろえた名前 → 定義（同じ名前は先に書いたもの） */
  defs: Map<string, FootnoteDef>;
  refs: FootnoteRef[];
}

/** 脚注として読まない所（コード・HTML のまとまり） */
const CODE = new Set(["FencedCode", "CodeBlock", "InlineCode", "HTMLBlock", "CodeText"]);

function inCode(tree: Tree, pos: number): boolean {
  for (let node = tree.resolveInner(pos, 1); node; node = node.parent!) {
    if (CODE.has(node.name)) return true;
    if (!node.parent) break;
  }
  return false;
}

const DEF = /^ {0,3}\[\^([^\]\s]+)\]:[ \t]?/gm;
const REF = /\[\^([^\]\s]+)\]/g;

const footnotesByTree = new WeakMap<Tree, { text: string; footnotes: Footnotes }>();

/** 文の中の脚注（同じ木と文には同じ結果） */
export function footnotes(tree: Tree, text: string): Footnotes {
  const known = footnotesByTree.get(tree);
  if (known && known.text === text) return known.footnotes;
  const defs = new Map<string, FootnoteDef>();
  for (const m of text.matchAll(DEF)) {
    const from = m.index;
    const key = normalizeLabel(m[1]);
    if (defs.has(key) || inCode(tree, from + m[0].indexOf("["))) continue;
    // 続きの行（字下げした行）まで
    let to = text.indexOf("\n", from);
    if (to < 0) to = text.length;
    const parts = [text.slice(from + m[0].length, to)];
    while (to < text.length) {
      const next = text.indexOf("\n", to + 1);
      const line = text.slice(to + 1, next < 0 ? text.length : next);
      if (!/^(?: {4}|\t)\S/.test(line)) break;
      parts.push(line.trim());
      to = next < 0 ? text.length : next;
    }
    defs.set(key, { from, markTo: from + m[0].length, to, text: parts.join(" ").trim(), number: null });
  }
  const refs: FootnoteRef[] = [];
  let count = 0;
  for (const m of text.matchAll(REF)) {
    const def = defs.get(normalizeLabel(m[1]));
    // 定義の行の頭の [^名前]: は印でない
    if (!def || text[m.index + m[0].length] === ":" || inCode(tree, m.index)) continue;
    if (def.number === null) def.number = ++count;
    refs.push({ from: m.index, to: m.index + m[0].length, label: normalizeLabel(m[1]), number: def.number });
  }
  const result = { defs, refs };
  footnotesByTree.set(tree, { text, footnotes: result });
  return result;
}

/** pos にある脚注の印（なければ null） */
export function footnoteAt(notes: Footnotes, pos: number): { ref: FootnoteRef; def: FootnoteDef } | null {
  const ref = notes.refs.find((r) => pos >= r.from && pos <= r.to);
  const def = ref && notes.defs.get(ref.label);
  return ref && def ? { ref, def } : null;
}
