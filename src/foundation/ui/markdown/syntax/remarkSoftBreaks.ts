/**
 * 段落などの文の中の 1 回の改行を、改行（mdast の break）にする remark のプラグイン。
 * CommonMark では 1 回の改行は改行にならず、ブラウザは改行の文字を空白として描くので、日本語の行がつながって間に半角の空白が入る。
 * AI の返答は 1 回の改行で行を分けて書くので、どの画面でも改行として出す（折り返して書いた .md は、折り返した所で行が切れて見える）。
 * 空行の段落の区切り・行末の空白 2 つと \ の改行・コード・数式・生の HTML は、文字の節（text）ではないので変わらない。
 * 改行の文字は残す（hast では br の後ろに改行の文字が付く）ので、書きかけの返答の薄く出す段（wrapStreamTail）の文字の数はずれない
 */
import type { Break, Parent, PhrasingContent, Root, RootContent, Text } from "mdast";

const LINE_ENDING = /\r\n|\r|\n/;

/** 文字の節を、改行の所で文字と break に分ける */
function splitText(node: Text): PhrasingContent[] {
  const lines = node.value.split(LINE_ENDING);
  if (lines.length < 2) return [node];
  const out: PhrasingContent[] = [];
  lines.forEach((value, i) => {
    if (i > 0) out.push({ type: "break" } satisfies Break);
    if (value) out.push({ type: "text", value });
  });
  return out;
}

function walk(parent: Parent) {
  parent.children = parent.children.flatMap((child: RootContent): RootContent[] => {
    if (child.type === "text") return splitText(child);
    if ("children" in child) walk(child);
    return [child];
  });
}

export function remarkSoftBreaks() {
  return (tree: Root) => walk(tree);
}
