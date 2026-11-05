// メモの Markdown 表示（Obsidian のライブプレビューと同じ）で、どこをどう見せるかを決める純粋関数。
// Markdown の構文の木（@lezer/markdown・GFM）から、カーソルのない行の記号（# ・** ・` ・> ・リンクの URL など）を隠し、
// 見出し・太字・コード・引用などの見た目を付ける印を返す（コードの塊の ``` もカーソルのない行では隠す）。ファイルの中身は変えない（見せ方だけ。書き換えはチェックボックスを押したときだけ）
import type { SyntaxNodeRef, Tree } from "@lezer/common";

/** 見せ方の印（エディタの飾りに直す。位置はファイルの文字の位置） */
export type PreviewMark =
  /** 記号を隠す（カーソルのない行だけ） */
  | { kind: "hide"; from: number; to: number }
  /** 行の見た目（見出し・引用・コードの塊）。at は行の頭 */
  | { kind: "line"; at: number; cls: string }
  /** 文字の見た目（太字・斜体・コード・取り消し線・リンク） */
  | { kind: "span"; from: number; to: number; cls: string }
  /** 箇条書きの記号（- * +）を「•」に */
  | { kind: "bullet"; from: number; to: number }
  /** タスクの [ ] / [x] をチェックボックスに（押すと書き換える） */
  | { kind: "task"; from: number; to: number; checked: boolean }
  /** 区切り線（---）を線に */
  | { kind: "rule"; from: number; to: number };

/** 中身に見た目を付ける要素 */
const SPAN_CLASS: Record<string, string> = {
  StrongEmphasis: "md-strong",
  Emphasis: "md-em",
  InlineCode: "md-code",
  Strikethrough: "md-strike",
  Link: "md-link",
};

/**
 * 見せ方の印を、from〜to（見えている範囲）について返す。isActive は、その位置の行にカーソル（選んでいる範囲）があるか
 * （その行は記号をそのまま見せ、書きやすくする。Obsidian と同じ）。印の順は木をたどった順（エディタの側で並べ直す）
 */
export function previewMarks(tree: Tree, text: string, isActive: (pos: number) => boolean, from = 0, to = text.length): PreviewMark[] {
  const out: PreviewMark[] = [];
  const lineStart = (pos: number) => text.lastIndexOf("\n", pos - 1) + 1;
  // 記号のあとの空白 1 つも隠す（「# 見出し」の空白・「> 引用」の空白）
  const withSpace = (pos: number) => (text[pos] === " " ? pos + 1 : pos);
  /** a〜b にかかる行それぞれの頭 */
  const linesOf = (a: number, b: number) => {
    const starts: number[] = [];
    for (let p = lineStart(a); p <= b; ) {
      starts.push(p);
      const end = text.indexOf("\n", p);
      if (end < 0) break;
      p = end + 1;
    }
    return starts;
  };
  const hide = (a: number, b: number) => {
    if (!isActive(a) && b > a) out.push({ kind: "hide", from: a, to: b });
  };
  const parentName = (n: SyntaxNodeRef) => n.node.parent?.name ?? "";

  tree.iterate({
    from,
    to,
    enter(n) {
      const name = n.name;
      const heading = /^ATXHeading(\d)$/.exec(name);
      if (heading) {
        out.push({ kind: "line", at: lineStart(n.from), cls: `md-h${heading[1]}` });
        return;
      }
      const span = SPAN_CLASS[name];
      if (span) {
        out.push({ kind: "span", from: n.from, to: n.to, cls: span });
        return;
      }
      switch (name) {
        case "HeaderMark":
          // 見出しの頭の # だけ（行の終わりの # や、下線で書く見出しの ===・--- は残す）
          if (/^ATXHeading/.test(parentName(n)) && n.from === lineStart(n.from)) hide(n.from, withSpace(n.to));
          return;
        case "EmphasisMark":
        case "StrikethroughMark":
        case "LinkMark":
          hide(n.from, n.to);
          return;
        case "CodeMark":
          // 行の中のコードの `・コードの塊の ```（カーソルのない行は、塊の地だけを見せる）
          if (parentName(n) === "InlineCode" || parentName(n) === "FencedCode") hide(n.from, n.to);
          return;
        case "CodeInfo":
          // コードの塊の言語の名前（```js の js）
          hide(n.from, n.to);
          return;
        case "URL":
          // リンクの行き先（[文](URL) の URL）は隠し、文だけを見せる
          if (parentName(n) === "Link") hide(n.from, n.to);
          return;
        case "Blockquote":
          for (const at of linesOf(n.from, n.to)) out.push({ kind: "line", at, cls: "md-quote" });
          return;
        case "QuoteMark":
          hide(n.from, withSpace(n.to));
          return;
        case "FencedCode":
          for (const at of linesOf(n.from, n.to)) out.push({ kind: "line", at, cls: "md-codeblock" });
          return;
        case "ListMark": {
          const item = n.node.parent;
          if (isActive(n.from) || item?.parent?.name !== "BulletList") return;
          // タスクの行は記号を隠してチェックボックスだけ、ほかは「•」
          if (item.getChild("Task")) out.push({ kind: "hide", from: n.from, to: withSpace(n.to) });
          else out.push({ kind: "bullet", from: n.from, to: n.to });
          return;
        }
        case "TaskMarker":
          if (!isActive(n.from)) out.push({ kind: "task", from: n.from, to: n.to, checked: /x/i.test(text.slice(n.from, n.to)) });
          return;
        case "HorizontalRule":
          if (!isActive(n.from)) out.push({ kind: "rule", from: n.from, to: n.to });
          return;
      }
    },
  });
  return out;
}
