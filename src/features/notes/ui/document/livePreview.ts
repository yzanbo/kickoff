// ノートの Markdown 表示（Obsidian のライブプレビューと同じ）で、どこをどう見せるかを決める純粋関数。
// Markdown の構文の木（@lezer/markdown・GFM）から、カーソルのない行の記号（# ・** ・` ・> ・リンクの URL など）を隠し、
// 見出し・太字・コード・引用などの見た目を付ける印を返す（コードの塊の ``` もカーソルのない行では隠す）。ファイルの中身は変えない（見せ方だけ。書き換えはチェックボックスを押したときだけ）
import type { SyntaxNodeRef, Tree } from "@lezer/common";
import { footnotes } from "./footnotes";
import { decodeEntity, inlineHtmlRanges } from "./inlineSyntax";
import { bareUrlEnd, isBareUrl, linkDefinitions, linkHref } from "./noteLinks";

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
  | { kind: "rule"; from: number; to: number }
  /** 文字に置き換える（実体参照 &amp; を & に） */
  | { kind: "text"; from: number; to: number; text: string }
  /** 行の中の HTML（返答の表示と同じ処理で描く） */
  | { kind: "html"; from: number; to: number; source: string }
  /** 脚注の印の番号（上付きの小さな数字に置き換える） */
  | { kind: "sup"; from: number; to: number; text: string }
  /** 画像（![説明](パス)。行き先のあるものだけ） */
  | { kind: "image"; from: number; to: number; src: string; alt: string };

/** 中身に見た目を付ける要素 */
const SPAN_CLASS: Record<string, string> = {
  StrongEmphasis: "md-strong",
  Emphasis: "md-em",
  InlineCode: "md-code",
  Strikethrough: "md-strike",
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
  const isOpeningFence = (n: SyntaxNodeRef) => n.node.parent?.firstChild?.from === n.from;
  const inQuote = (n: SyntaxNodeRef) => n.node.parent?.parent?.name === "Blockquote";
  // 行き先のあるリンクだけを飾る（定義のない [文字] は角かっこごと文字のまま。返答の表示と同じ）
  const defs = linkDefinitions(tree, text);
  const isLink = (n: SyntaxNodeRef | null | undefined) => !!n && n.name === "Link" && linkHref(n.node, text, defs) !== null;
  // 行の中の HTML（カーソルのない行だけ描く。中の飾りは描く物に任せる）
  const html = inlineHtmlRanges(tree, text, from, to).filter((r) => !isActive(r.from));
  for (const r of html) out.push({ kind: "html", from: r.from, to: r.to, source: text.slice(r.from, r.to) });
  const inHtml = (n: SyntaxNodeRef) => html.some((r) => n.from >= r.from && n.to <= r.to);
  // 脚注: 本文の印は上付きの番号、定義の行は頭の [^名前]: を番号にして小さな文字（どちらもカーソルの行は元の文字）
  const notes = footnotes(tree, text);
  for (const r of notes.refs) if (r.to >= from && r.from <= to && !isActive(r.from)) out.push({ kind: "sup", from: r.from, to: r.to, text: String(r.number) });
  for (const d of notes.defs.values()) {
    if (d.number === null || d.to < from || d.from > to) continue;
    for (const at of linesOf(d.from, d.to)) out.push({ kind: "line", at, cls: "md-footdef" });
    if (!isActive(d.from)) out.push({ kind: "text", from: d.from, to: d.markTo, text: `${d.number}. ` });
  }

  tree.iterate({
    from,
    to,
    enter(n) {
      const name = n.name;
      if (inHtml(n)) return false;
      const heading = /^ATXHeading(\d)$/.exec(name);
      if (heading) {
        out.push({ kind: "line", at: lineStart(n.from), cls: `md-h${heading[1]}` });
        return;
      }
      // 下線で書く見出し: 中身の行に見出しの見た目（下線の行は HeaderMark で隠す）
      const setext = /^SetextHeading(\d)$/.exec(name);
      if (setext) {
        const mark = n.node.getChild("HeaderMark");
        for (const at of linesOf(n.from, (mark?.from ?? n.to) - 1)) out.push({ kind: "line", at, cls: `md-h${setext[1]}` });
        return;
      }
      // \ の打ち消しは \ を隠し、実体参照は文字にする（カーソルのない行だけ）
      if (name === "Escape") {
        hide(n.from, n.from + 1);
        return;
      }
      if (name === "Entity") {
        const decoded = decodeEntity(text.slice(n.from, n.to));
        if (decoded !== null && !isActive(n.from)) out.push({ kind: "text", from: n.from, to: n.to, text: decoded });
        return;
      }
      const span = SPAN_CLASS[name];
      if (span) {
        out.push({ kind: "span", from: n.from, to: n.to, cls: span });
        return;
      }
      if (name === "Link") {
        if (isLink(n)) out.push({ kind: "span", from: n.from, to: n.to, cls: "md-link" });
        return;
      }
      // 画像（行き先を書いたものだけ。![[名前]] は返答の表示でも文字のまま）
      if (name === "Image") {
        const url = n.node.getChild("URL");
        const marks = n.node.getChildren("LinkMark");
        if (url && marks.length >= 2 && !isActive(n.from)) out.push({ kind: "image", from: n.from, to: n.to, src: text.slice(url.from, url.to), alt: text.slice(marks[0].to, marks[1].from) });
        return false;
      }
      // <URL> と URL のそのまま書き（そのまま書きは日本語の記号の手前まで。返答の表示と同じ）
      if (name === "Autolink") {
        out.push({ kind: "span", from: n.from, to: n.to, cls: "md-link" });
        return;
      }
      if (isBareUrl(n.node)) {
        const end = bareUrlEnd(text, n.from, n.to);
        if (end > n.from) out.push({ kind: "span", from: n.from, to: end, cls: "md-link" });
        return;
      }
      // リンクの定義の行（[名前]: URL）は消さずに、薄い小さな文字で見せる（脚注の定義は除く）
      if (name === "LinkReference") {
        if (text[n.from + 1] !== "^") out.push({ kind: "line", at: lineStart(n.from), cls: "md-linkdef" });
        return;
      }
      switch (name) {
        case "HeaderMark":
          // 見出しの頭の # と、下線で書く見出しの下線の行（行の終わりの # は残す）
          if (/^ATXHeading/.test(parentName(n)) && n.from === lineStart(n.from)) hide(n.from, withSpace(n.to));
          else if (/^SetextHeading/.test(parentName(n))) hide(n.from, n.to);
          return;
        case "EmphasisMark":
        case "StrikethroughMark":
          hide(n.from, n.to);
          return;
        case "LinkMark":
          // リンクの [ ] ( ) と <URL> の < >（画像・定義の行の印は、まだ見た目を付けないので残す）
          if (isLink(n.node.parent) || parentName(n) === "Autolink") hide(n.from, n.to);
          return;
        case "CodeMark":
          // 行の中のコードの `・コードの塊の閉じの ```（開きの行は帯に替える。codeHighlight）。引用の中の塊は帯を出さないので開きも隠す
          if (parentName(n) === "InlineCode" || (parentName(n) === "FencedCode" && (!isOpeningFence(n) || inQuote(n)))) hide(n.from, n.to);
          return;
        case "CodeInfo":
          // コードの塊の言語の名前（```js の js。引用の中の塊だけ。ほかは帯に出す）
          if (inQuote(n)) hide(n.from, n.to);
          return;
        case "URL":
          // リンクの行き先（[文](URL) の URL）は隠し、文だけを見せる
          if (isLink(n.node.parent)) hide(n.from, n.to);
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
