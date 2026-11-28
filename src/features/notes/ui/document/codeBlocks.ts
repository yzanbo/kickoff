// ノートのコードの塊（``` / ~~~）の場所と中身、色付けの断片を文の中の範囲に直す純粋な関数。
// 中身は返答の表示と同じ（開きの印の字下げぶんを各行の頭から除く）。色付けは返答と同じ部品（foundation/ui/code/highlight）に頼む
import type { SyntaxNode, Tree } from "@lezer/common";
import type { CodeToken } from "@/foundation/ui/code/highlight";

/** コードの塊 1 つ */
export interface CodeBlockSource {
  /** 開きの行の頭と終わり */
  headFrom: number;
  headTo: number;
  /** 塊の終わり（閉じの行の終わり。閉じていなければ文の終わり） */
  to: number;
  /** 言語名など（``` の後ろの文字） */
  info: string;
  /** 中身の行（文の中の位置と、字下げを除いた文字） */
  lines: { from: number; text: string }[];
  /** 中身（行を改行でつないだもの） */
  code: string;
  /** 閉じの行があるか */
  closed: boolean;
}

/** コードの塊が入りうるまとまり（文の中は探さない） */
const CONTAINERS = new Set(["Document", "BulletList", "OrderedList", "ListItem"]);

function blockOf(node: SyntaxNode, text: string): CodeBlockSource | null {
  const headFrom = text.lastIndexOf("\n", node.from - 1) + 1;
  const headEnd = text.indexOf("\n", headFrom);
  const headTo = headEnd < 0 ? text.length : headEnd;
  const head = text.slice(headFrom, headTo);
  // 引用の中の塊は飾らない（行の頭の > を写せないため）
  if (/^\s*>/.test(head)) return null;
  const indent = head.length - head.trimStart().length;
  const fence = /^(`{3,}|~{3,})(.*)$/.exec(head.trimStart());
  if (!fence) return null;
  const marks = node.getChildren("CodeMark");
  const closed = marks.length >= 2;
  const bodyEnd = closed ? text.lastIndexOf("\n", marks[marks.length - 1].from - 1) : node.to;
  const lines: { from: number; text: string }[] = [];
  for (let pos = headTo + 1; pos <= bodyEnd && pos <= text.length; ) {
    const end = text.indexOf("\n", pos);
    const lineEnd = end < 0 || end > bodyEnd ? Math.min(bodyEnd, text.length) : end;
    const raw = text.slice(pos, lineEnd);
    const strip = Math.min(indent, raw.length - raw.trimStart().length);
    lines.push({ from: pos + strip, text: raw.slice(strip) });
    if (end < 0 || end >= bodyEnd) break;
    pos = end + 1;
  }
  return { headFrom, headTo, to: node.to, info: fence[2].trim(), lines, code: lines.map((l) => l.text).join("\n"), closed };
}

/** 文の中のコードの塊（書いた順） */
export function codeBlocks(tree: Tree, text: string, from = 0, to = text.length): CodeBlockSource[] {
  const out: CodeBlockSource[] = [];
  const walk = (node: SyntaxNode) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.to < from || child.from > to) continue;
      if (child.name === "FencedCode") {
        const block = blockOf(child, text);
        if (block) out.push(block);
      } else if (CONTAINERS.has(child.name)) walk(child);
    }
  };
  walk(tree.topNode);
  return out;
}

/** 色付けの断片の見た目（返答のコードと同じ。CodeLine） */
function styleOf({ color, fontStyle = 0 }: CodeToken): string {
  return [color && `color: ${color}`, fontStyle & 1 && "font-style: italic", fontStyle & 2 && "font-weight: 600", fontStyle & 4 && "text-decoration: underline"].filter(Boolean).join("; ");
}

/** 色付けの断片を、文の中の範囲と見た目にする（行の数が合わなければ空。色のない断片は飛ばす） */
export function tokenRanges(block: CodeBlockSource, tokens: readonly (readonly CodeToken[])[]): { from: number; to: number; style: string }[] {
  if (tokens.length !== block.lines.length) return [];
  const out: { from: number; to: number; style: string }[] = [];
  block.lines.forEach((line, i) => {
    let pos = line.from;
    for (const token of tokens[i]) {
      const end = pos + token.content.length;
      const style = styleOf(token);
      if (style && end > pos) out.push({ from: pos, to: end, style });
      pos = end;
    }
  });
  return out;
}
