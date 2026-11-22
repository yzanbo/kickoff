// DB の AI のツールの、画面とスマホに出す表示名と記録の行の文
import { aiToolViewOf, type AiToolView } from "@shared/foundation/aiToolView";
import { AI_OPEN_SQL_TOOL, describeOpenSql } from "@shared/chat/aiOpen";

/** DB の機能のツールの表示の表 */
export const DB_TOOL_VIEWS: readonly AiToolView[] = [aiToolViewOf(AI_OPEN_SQL_TOOL, "SQL のタブに入れる", describeOpenSql)];
