// チャットの AI がプロジェクトに足す・変えるツール（kickoff_chat の add_snippet・move_note）の、コアと画面で共有する名前・引数と、記録の行に出す文

/** 定型文に登録するツールの名前 */
export const AI_ADD_SNIPPET_TOOL = "mcp__kickoff_chat__add_snippet";

/** ノートの名前を変える・移すツールの名前 */
export const AI_MOVE_NOTE_TOOL = "mcp__kickoff_chat__move_note";

/** 記録の行に出す文（名前があれば名前、なければ本文の 1 行目） */
export function describeAddSnippet(input: Record<string, unknown>): string {
  if (typeof input.label === "string" && input.label.trim()) return input.label.trim();
  return typeof input.text === "string" ? (input.text.trim().split("\n")[0] ?? "") : "";
}

/** 記録の行に出す文（「ノート.md → 済/ノート.md」） */
export function describeMoveNote(input: Record<string, unknown>): string {
  const from = typeof input.from === "string" ? input.from : "";
  const to = typeof input.to === "string" ? input.to : "";
  return from && to ? `${from} → ${to}` : from || to;
}
