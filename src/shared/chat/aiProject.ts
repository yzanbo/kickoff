// チャットの AI がプロジェクトに足す・変えるツール（kickoff_chat の add_snippet・move_memo）の、コアと画面で共有する名前・引数と、記録の行に出す文

/** 定型文に登録するツールの名前 */
export const AI_ADD_SNIPPET_TOOL = "mcp__kickoff_chat__add_snippet";

/** メモの名前を変える・移すツールの名前 */
export const AI_MOVE_MEMO_TOOL = "mcp__kickoff_chat__move_memo";

/** add_snippet の引数（範囲はいつもこのプロジェクトだけ。共通にするのは利用者が画面で切り替える） */
export interface AddSnippetInput {
  text: string;
  label?: string;
}

/** move_memo の引数（どちらもメモのフォルダからの相対パスか、メモのフォルダの中の絶対パス） */
export interface MoveMemoInput {
  from: string;
  to: string;
}

/** 記録の行に出す文（名前があれば名前、なければ本文の 1 行目） */
export function describeAddSnippet(input: Record<string, unknown>): string {
  if (typeof input.label === "string" && input.label.trim()) return input.label.trim();
  return typeof input.text === "string" ? (input.text.trim().split("\n")[0] ?? "") : "";
}

/** 記録の行に出す文（「メモ.md → 済/メモ.md」） */
export function describeMoveMemo(input: Record<string, unknown>): string {
  const from = typeof input.from === "string" ? input.from : "";
  const to = typeof input.to === "string" ? input.to : "";
  return from && to ? `${from} → ${to}` : from || to;
}
