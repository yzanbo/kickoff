// チャットの AI が利用者の見ている画面を読むツール（kickoff_chat の get_user_view）の、コアと画面で共有する名前と、
// 記録の行に出す文（ツールの名前だけでは何が起きたか分からないので、結果の 1 行目の［…］から作る）
import { aiToolViewOf, type AiToolView } from "@shared/foundation/aiToolView";

/** 利用者が見ているものを読むツールの名前 */
export const AI_GET_USER_VIEW_TOOL = "mcp__kickoff_chat__get_user_view";

/** 結果の 1 行目に置く、記録の行の文（「画面を見ました（エディタ: runner.ts 120〜135 行を選択中 ほか）」など） */
export const userViewSummaryLine = (summary: string) => `［${summary}］`;

/** 結果の 1 行目から、記録の行の文を読む（なければ null） */
export function userViewSummaryOf(result: string | undefined): string | null {
  const m = /^［(.+)］/.exec(result ?? "");
  return m ? m[1] : null;
}

/** userView の機能のツールの表示の表（引数はない。何を読んだか・読めなかった事情は、ツールの行が結果の 1 行目から出す） */
export const USER_VIEW_TOOL_VIEWS: readonly AiToolView[] = [aiToolViewOf(AI_GET_USER_VIEW_TOOL, "画面を見る")];
