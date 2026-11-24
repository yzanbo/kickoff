// PR の差分のどの行にレビューのコメントを付けるか（右クリックした行・選んだ行の範囲を、差分の表の data- から読む）
import type { GitHubReviewDraftComment } from "@shared/github/types";
import { DIFF_ROW_ATTRS, diffCellOf, type DiffLine } from "@/foundation/ui/diff/diffModel";

/** コメントを付ける所（start_line があれば start_line〜line の範囲） */
export type ReviewTarget = Pick<GitHubReviewDraftComment, "path" | "line" | "side" | "start_line">;

const sideOf = (cell: HTMLElement): "LEFT" | "RIGHT" => (diffCellOf(cell).side === "old" ? "LEFT" : "RIGHT");

/**
 * 右クリックした所のコメントを付ける行。選んだ文がその差分の中にあれば、選んだ行の範囲（変更後の行を含めば変更後の側だけ、なければ変更前の側）、
 * なければ右クリックした行。差分の行の外なら null
 */
export function reviewTargetAt(target: EventTarget | null, selection: Selection | null): ReviewTarget | null {
  const el = target instanceof Element ? target : null;
  if (el?.closest("textarea, input")) return null;
  const section = el?.closest<HTMLElement>(".github-file[data-path]");
  if (!section) return null;
  const path = section.dataset.path ?? "";
  if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const cells = [...section.querySelectorAll<HTMLElement>(DIFF_ROW_ATTRS.cell)].filter((c) => range.intersectsNode(c));
    if (cells.length > 0) {
      const side = cells.some((c) => sideOf(c) === "RIGHT") ? "RIGHT" : "LEFT";
      const numbers = cells.filter((c) => sideOf(c) === side).map((c) => diffCellOf(c).no);
      const from = Math.min(...numbers);
      const to = Math.max(...numbers);
      return { path, line: to, side, start_line: from < to ? from : null };
    }
  }
  const cell = el?.closest<HTMLElement>("tr")?.querySelector<HTMLElement>(DIFF_ROW_ATTRS.cell);
  if (!cell) return null;
  return { path, line: diffCellOf(cell).no, side: sideOf(cell), start_line: null };
}

/** 差分の行が、コメントを付けた所（範囲なら終わりの行）か（RIGHT は変更後の行番号、LEFT は消した行の変更前の行番号） */
export function isTargetLine(line: DiffLine, t: Pick<ReviewTarget, "line" | "side">): boolean {
  return t.side === "RIGHT" ? line.newNo === t.line : line.newNo === undefined && line.oldNo === t.line;
}

/** 行の呼び名（「12 行目」「10〜12 行目」。変更前の側なら「変更前の」を添える） */
export function targetLabel(t: Pick<ReviewTarget, "line" | "side" | "start_line">): string {
  const lines = t.start_line !== null && t.start_line < t.line ? `${t.start_line}〜${t.line} 行目` : `${t.line} 行目`;
  return t.side === "LEFT" ? `変更前の ${lines}` : lines;
}
