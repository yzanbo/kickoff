// ノートを AI が開く・移す・ほかのプロジェクトのノートを読む / 書くツール（kickoff_chat の open_note・move_note・get_project_note_dir・write_project_note）の、画面とスマホに出す表示名と記録の行の文
import { aiToolViewOf, type AiToolView } from "@shared/foundation/aiToolView";
import { AI_OPEN_NOTE_TOOL, describeOpenNote } from "@shared/chat/aiOpen";
import { AI_MOVE_NOTE_TOOL, describeMoveNote } from "@shared/chat/aiProject";

/** 共通のチャットが、利用者のプロジェクトのノートのフォルダの場所を知るツールの名前 */
export const AI_GET_PROJECT_NOTE_DIR_TOOL = "mcp__kickoff_chat__get_project_note_dir";

/** 共通のチャットが、利用者のプロジェクトのノートを書くツールの名前 */
export const AI_WRITE_PROJECT_NOTE_TOOL = "mcp__kickoff_chat__write_project_note";

/** 記録の行に出す文（「kickoff の 仕様/メモ.md」） */
function describeProjectNote(input: Record<string, unknown>): string {
  const project = typeof input.project === "string" || typeof input.project === "number" ? String(input.project) : "";
  const file = typeof input.path === "string" ? input.path : "";
  return [project && `${project} の`, file].filter(Boolean).join(" ");
}

/** ノートの機能のツールの表示の表 */
export const NOTE_TOOL_VIEWS: readonly AiToolView[] = [
  // どのノートをどこに開いたか（「機能の仕様/図.html（別ウィンドウ）」。場所を省いたら設定の開き方なので付けない）
  aiToolViewOf(AI_OPEN_NOTE_TOOL, "ノートを開く", describeOpenNote),
  aiToolViewOf(AI_MOVE_NOTE_TOOL, "ノートを移動", describeMoveNote),
  aiToolViewOf(AI_GET_PROJECT_NOTE_DIR_TOOL, "プロジェクトのノートの場所を確かめる", describeProjectNote),
  aiToolViewOf(AI_WRITE_PROJECT_NOTE_TOOL, "プロジェクトのノートを書く", describeProjectNote),
];
