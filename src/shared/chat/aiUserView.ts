// チャットの AI が利用者の見ている画面を読むツール（kickoff_chat の get_user_view。メモの仕様書「0019_AI の操作ツールの追加」の D）の、コアと画面で共有する名前と、
// 記録の行に出す文（ツールの名前だけでは何が起きたか分からないので、結果の 1 行目の［…］から作る）

/** 利用者が見ているものを読むツールの名前 */
export const AI_GET_USER_VIEW_TOOL = "mcp__kickoff_chat__get_user_view";

/** 結果の 1 行目に置く、記録の行の文（「画面を見ました（エディタ: runner.ts 120〜135 行を選択中 ほか）」など） */
export const userViewSummaryLine = (summary: string) => `［${summary}］`;

/** 結果の 1 行目から、記録の行の文を読む（なければ null） */
export function userViewSummaryOf(result: string | undefined): string | null {
  const m = /^［(.+)］/.exec(result ?? "");
  return m ? m[1] : null;
}
