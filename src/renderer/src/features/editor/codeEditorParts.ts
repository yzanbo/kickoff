// 編集の部品（CodeEditor）の補助: Git との違いの帯の飾りと、選んでいる所の読み方
import * as monaco from "./monacoEditor";
import type { CodeSelection } from "./codeSelection";
import type { QuickDiffHunk } from "./quickDiff";

/** 違いの種類ごとの色（右端の概要の帯。行の横の帯は CSS の .quick-diff-*） */
const QUICK_DIFF_COLORS: Record<QuickDiffHunk["kind"], string> = { added: "--ok", modified: "--info", deleted: "--ng" };

/** Git との違いの帯（行番号の横の色の帯と、右端の概要の帯の印） */
export function quickDiffDecorations(hunks: QuickDiffHunk[]): monaco.editor.IModelDeltaDecoration[] {
  const style = getComputedStyle(document.documentElement);
  return hunks.map((h) => {
    // 消した所は、直前の行の下の端に印（先頭を消したときは 1 行目の上の端）
    const start = Math.max(h.start, 1);
    const end = Math.max(h.end, 1);
    const top = h.kind === "deleted" && h.start === 0 ? " top" : "";
    return {
      range: { startLineNumber: start, startColumn: 1, endLineNumber: end, endColumn: 1 },
      options: {
        isWholeLine: true,
        linesDecorationsClassName: `quick-diff quick-diff-${h.kind}${top}`,
        overviewRuler: { color: style.getPropertyValue(QUICK_DIFF_COLORS[h.kind]).trim(), position: monaco.editor.OverviewRulerLane.Left },
      },
    };
  });
}

/** 選んでいる所（行・文・画面の位置。選んでいなければ null） */
export function readSelection(editor: monaco.editor.ICodeEditor): CodeSelection | null {
  const model = editor.getModel();
  const selection = editor.getSelection();
  const node = editor.getDomNode();
  if (!model || !selection || selection.isEmpty() || !node) return null;
  // 行の終わりから選び始めた・次の行の頭で選び終えたときは、その行を含めない（行ごと選んだときの形）
  const first = selection.startLineNumber;
  const from = selection.startColumn === model.getLineMaxColumn(first) && selection.endLineNumber > first ? first + 1 : first;
  const to = selection.endColumn === 1 && selection.endLineNumber > from ? selection.endLineNumber - 1 : selection.endLineNumber;
  const box = node.getBoundingClientRect();
  const start = editor.getScrolledVisiblePosition(selection.getStartPosition());
  const end = editor.getScrolledVisiblePosition(selection.getEndPosition());
  const left = Math.min(start?.left ?? 0, end?.left ?? 0);
  return {
    from,
    to,
    text: model.getValueInRange(selection),
    code: model.getValueInRange({ startLineNumber: from, startColumn: 1, endLineNumber: to, endColumn: model.getLineMaxColumn(to) }),
    // 選び始めが上へ隠れていれば、部品の上の端に出す
    rect: { left: box.left + left, top: box.top + Math.max(0, Math.min(start?.top ?? 0, box.height)), width: Math.abs((end?.left ?? left) - (start?.left ?? left)) },
  };
}
