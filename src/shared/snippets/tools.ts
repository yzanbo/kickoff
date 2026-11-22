// 定型文を AI が足すツール（kickoff_chat の add_snippet）の、画面とスマホに出す表示名と記録の行の文
import { aiToolViewOf, type AiToolView } from "@shared/foundation/aiToolView";
import { AI_ADD_SNIPPET_TOOL, describeAddSnippet } from "@shared/chat/aiProject";

/** 定型文の機能のツールの表示の表 */
export const SNIPPET_TOOL_VIEWS: readonly AiToolView[] = [aiToolViewOf(AI_ADD_SNIPPET_TOOL, "定型文に登録", describeAddSnippet)];
