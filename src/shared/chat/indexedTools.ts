// 記録の索引が呼び出しと結果を丸ごと入れるツール（サブエージェントの起動・報告・ToDo・図）と、書いている間を画面に出す図のツール。
// 図のツールの名前は visuals もここから読む（chat は visuals を読まない）
import { INDEXED_CLAUDE_TOOLS } from "@shared/ai/claudeTools";

/** 図を描くツールの名前 */
export const AI_SHOW_VISUAL_TOOL = "mcp__kickoff_chat__show_visual";
/** 描いた図を描き直すツールの名前 */
export const AI_UPDATE_VISUAL_TOOL = "mcp__kickoff_chat__update_visual";

/** 中身が長いので、書いている間は「図を描いています…」を出すツール（図） */
export const DRAWING_TOOLS: ReadonlySet<string> = new Set([AI_SHOW_VISUAL_TOOL, AI_UPDATE_VISUAL_TOOL]);

/** R2: 呼び出しと結果を丸ごと入れるツール（サブエージェントの起動・報告・ToDo・図） */
export const INDEX_TOOLS: ReadonlySet<string> = new Set([...INDEXED_CLAUDE_TOOLS, ...DRAWING_TOOLS]);
