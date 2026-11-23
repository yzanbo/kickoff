// 編集の部品（CodeEditor）の補助: 作ったエディタへの付け足し（attach…）と、Git との違いの帯の飾り・選んでいる所の読み方
import * as monaco from "./monacoEditor";
import { registerCodeSelection, type CodeSelection } from "@/foundation/ui/code/codeSelection";
import { quickDiff, type QuickDiffHunk } from "@/foundation/ui/diff/quickDiff";
import type { BlameLines } from "./filesGit";
import { syncMonacoFindOptions } from "./monacoFindOptions";

/** 打つのが止まってから、Git との違いの帯を付け直すまでの時間 */
const QUICK_DIFF_DELAY_MS = 200;

/** 付け足しが読むもの（いまの値は関数で読む。部品を作り直さずに変わる） */
export interface AttachContext {
  /** 部品の入れ物 */
  host: HTMLDivElement;
  /** 差分の編集か（差分そのものが出ているので、Git との違いの帯は付けない） */
  diffing: boolean;
  /** 保存した中身（ここから変えたら未保存。行の変更の記録は、これと同じ間だけ出す） */
  saved(): string;
  /** Git との違いの帯の元の中身（null なら出さない） */
  quickBase(): string | null;
  /** 行ごとの変更の記録（null なら出さない） */
  blame(): BlameLines | null;
  /** ⌘S */
  save(content: string): void;
  /** ⌥Z（折り返しの切り替え） */
  toggleWrap(): void;
  /** ⌘F の検索の欄に渡すエディタ（外したら null） */
  showFind(editor: monaco.editor.IStandaloneCodeEditor | null): void;
  /** 付け直す口を入れる（テーマ・元の中身・記録が変わったとき。外したら null） */
  setRefresh(kind: "quickDiff" | "blame", refresh: (() => void) | null): void;
}

/** 外せるもの（Monaco の IDisposable と同じ形） */
interface Disposable {
  dispose(): void;
}

/** 作ったエディタへの付け足し 1 つ（返したものを片付けで dispose する） */
export type EditorAttachment = (editor: monaco.editor.IStandaloneCodeEditor, model: monaco.editor.ITextModel, ctx: AttachContext) => Disposable;

const disposable = (dispose: () => void): Disposable => ({ dispose });

/** Git との違いの帯（打つのが止まったら付け直す） */
export const attachQuickDiff: EditorAttachment = (editor, model, ctx) => {
  const decorations = editor.createDecorationsCollection();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const paint = () => {
    const base = ctx.quickBase();
    decorations.set(base === null || ctx.diffing ? [] : quickDiffDecorations(quickDiff(base, model.getValue())));
  };
  ctx.setRefresh("quickDiff", paint);
  paint();
  const sub = model.onDidChangeContent(() => {
    clearTimeout(timer);
    timer = setTimeout(paint, QUICK_DIFF_DELAY_MS);
  });
  return disposable(() => {
    clearTimeout(timer);
    sub.dispose();
    ctx.setRefresh("quickDiff", null);
  });
};

/** いまの行の変更の記録（行の終わりのあとに薄い字で足す。カーソルはそこに止まらない。未保存の間は出さない） */
export const attachBlame: EditorAttachment = (editor, model, ctx) => {
  const decorations = editor.createDecorationsCollection();
  const paint = () => {
    const position = editor.getPosition();
    const commit = position && model.getValue() === ctx.saved() ? (ctx.blame()?.at(position.lineNumber, model.getLineCount()) ?? null) : null;
    if (!position || !commit) return decorations.clear();
    const column = model.getLineMaxColumn(position.lineNumber);
    decorations.set([
      {
        range: { startLineNumber: position.lineNumber, startColumn: column, endLineNumber: position.lineNumber, endColumn: column },
        options: {
          // 幅のない範囲の差し込みの文字は、showIfCollapsed がないと描かれない
          showIfCollapsed: true,
          after: { content: `\u2003${commit.label}`, inlineClassName: "blame-inline", cursorStops: monaco.editor.InjectedTextCursorStops.None },
          hoverMessage: { value: commit.hover },
        },
      },
    ]);
  };
  ctx.setRefresh("blame", paint);
  paint();
  const cursorSub = editor.onDidChangeCursorPosition(paint);
  const contentSub = model.onDidChangeContent(paint);
  return disposable(() => {
    cursorSub.dispose();
    contentSub.dispose();
    ctx.setRefresh("blame", null);
  });
};

/** ⌘S（保存）と ⌥Z（折り返しの切り替え。VS Code と同じキー）。キーはエディタと一緒に片付く */
export const attachSaveKeys: EditorAttachment = (editor, _model, ctx) => {
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => ctx.save(editor.getValue()));
  editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyZ, () => ctx.toggleWrap());
  return disposable(() => {});
};

/** 選んでいる所の読み方を入れ物に登録する（右の欄で選んだ行をチャットに足す。codeSelection.ts） */
export const attachSelection: EditorAttachment = (editor, _model, ctx) => disposable(registerCodeSelection(ctx.host, () => readSelection(editor)));

/** ⌘F の検索の欄（ほかの検索の欄と同じ部品 MonacoFindBar。「Aa」「ab」「.*」はほかの検索の欄と同じ値にそろえる） */
export const attachFind: EditorAttachment = (editor, _model, ctx) => {
  ctx.showFind(editor);
  const unsync = syncMonacoFindOptions(editor);
  return disposable(() => {
    ctx.showFind(null);
    unsync();
  });
};

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
