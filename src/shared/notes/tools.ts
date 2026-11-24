// ノートを AI が開く・移すツール（kickoff_chat の open_note・move_note）の、画面とスマホに出す表示名と記録の行の文
import { aiToolViewOf, type AiToolView } from "@shared/foundation/aiToolView";
import { AI_OPEN_NOTE_TOOL, describeOpenNote } from "@shared/chat/aiOpen";
import { AI_MOVE_NOTE_TOOL, describeMoveNote } from "@shared/chat/aiProject";

/** ノートの機能のツールの表示の表 */
export const NOTE_TOOL_VIEWS: readonly AiToolView[] = [
  // どのノートをどこに開いたか（「機能の仕様/図.html（別ウィンドウ）」。場所を省いたら設定の開き方なので付けない）
  aiToolViewOf(AI_OPEN_NOTE_TOOL, "ノートを開く", describeOpenNote),
  aiToolViewOf(AI_MOVE_NOTE_TOOL, "ノートを移動", describeMoveNote),
];
