// 右の欄・別ウィンドウのコードの行（差分・ファイルの中身）で選んだ所を、パスと行番号付きの引用にする（選んだときのボタン SelectionAttach と右クリック useCodeQuoteMenu が読む）
import { quoteCode } from "@/features/chat/ui";
import { focusedCodeSelection } from "@/foundation/ui/code/codeSelection";
import { DIFF_ROW_ATTRS, diffCellOf } from "@/foundation/ui/diff/diffModel";

/** 選んだコードの行（画面の位置・チャット欄に足す引用・選んだ行のコード（行番号・+- を除いたもの）と行（パスを含めてコピー）） */
export interface PickedCode {
  rect: { left: number; top: number; width: number };
  quote: string;
  code: { text: string; lines: { from: number; to: number } };
}

/** 選んでいる範囲（なければ undefined） */
export function currentRange(): { selection: Selection; range: Range; element: Element | null } | undefined {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return undefined;
  const range = selection.getRangeAt(0);
  const common = range.commonAncestorContainer;
  return { selection, range, element: common instanceof Element ? common : common.parentElement };
}

/**
 * 選んでいる範囲が、root の中の 1 つのファイルのコードの行（右の欄・別ウィンドウの「変更」の差分・「ファイル」の中身。`[data-quote-path]` の中の
 * `.diff-code[data-no]`。ファイルの中身を編集の部品で開いていれば、その部品で選んだ行）にあれば、その行と位置（パスと行番号付きでコードを引用する）。差分は、変更後の行を選んでいれば変更後の行だけ、なければ変更前の行を使う
 * （左右に並べた表では、行ごと選ばれて両側が入るため）。ファイルの中身の行には側がない
 */
export function pickedInCode(root: Element | null): PickedCode | undefined {
  // 編集の部品（Monaco）で選んでいれば、その行（ページの選択にならないので、部品が置いた読み方で読む）
  const editing = root ? focusedCodeSelection(root) : undefined;
  if (editing) {
    const { from, to, code, rect } = editing.selection;
    return { rect, quote: quoteCode({ path: editing.section.dataset.quotePath ?? "", from, to, side: null, code, comment: "" }), code: { text: code, lines: { from, to } } };
  }
  const at = currentRange();
  const section = at?.element?.closest<HTMLElement>("[data-quote-path]");
  if (!at || !root || !section || !root.contains(section)) return undefined;
  const cells = [...section.querySelectorAll<HTMLElement>(DIFF_ROW_ATTRS.cell)].filter((cell) => at.range.intersectsNode(cell));
  const side: "new" | "old" | null = cells.some((c) => diffCellOf(c).side === "new") ? "new" : cells.some((c) => diffCellOf(c).side === "old") ? "old" : null;
  const picked = cells.filter((c) => diffCellOf(c).side === side);
  if (picked.length === 0) return undefined;
  // 1 列の表の行の頭の +・- は、コードに入れない
  const codeOf = (cell: HTMLElement) => (cell.textContent ?? "").slice(cell.querySelector(".diff-sign")?.textContent?.length ?? 0);
  const numbers = picked.map((c) => diffCellOf(c).no);
  const code = picked.map(codeOf).join("\n");
  const range = { path: section.dataset.quotePath ?? "", from: Math.min(...numbers), to: Math.max(...numbers), side };
  return { rect: at.range.getBoundingClientRect(), quote: quoteCode({ ...range, code, comment: "" }), code: { text: code, lines: { from: range.from, to: range.to } } };
}
