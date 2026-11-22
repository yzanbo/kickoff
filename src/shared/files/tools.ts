// 作業場所のファイルを AI が開くツール（kickoff_chat の open_file）の、画面とスマホに出す表示名と記録の行の文
import { aiToolViewOf, type AiToolView } from "@shared/foundation/aiToolView";
import { AI_OPEN_FILE_TOOL, describeOpenFile } from "@shared/chat/aiOpen";

/** ファイルの機能のツールの表示の表 */
export const FILE_TOOL_VIEWS: readonly AiToolView[] = [aiToolViewOf(AI_OPEN_FILE_TOOL, "ファイルを開く", describeOpenFile)];
