// コミットしていない変更を AI が開くツール（kickoff_chat の open_diff）の、画面とスマホに出す表示名と記録の行の文
import { aiToolViewOf, type AiToolView } from "@shared/foundation/aiToolView";
import { AI_OPEN_DIFF_TOOL, describeOpenDiff } from "@shared/chat/aiOpen";

/** Git の機能のツールの表示の表 */
export const GIT_TOOL_VIEWS: readonly AiToolView[] = [aiToolViewOf(AI_OPEN_DIFF_TOOL, "差分を開く", describeOpenDiff)];
