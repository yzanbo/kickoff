// Kickoff の AI のツールの表示の表の束ね（純粋。各機能の @shared/<機能>/tools.ts を機能の順に並べる。画面とスマホが読む）
import type { AiToolView } from "@shared/foundation/aiToolView";
import { CHAT_TOOL_VIEWS } from "@shared/chat/tools";
import { GUARD_TOOL_VIEWS } from "@shared/guard/tools";
import { SNIPPET_TOOL_VIEWS } from "@shared/snippets/tools";
import { VISUAL_TOOL_VIEWS } from "@shared/visuals/tools";
import { WORKPLACE_MOVE_TOOL_VIEWS } from "@shared/workplaceMove/tools";
import { USER_VIEW_TOOL_VIEWS } from "@shared/userView/tools";
import { NOTIFICATION_TOOL_VIEWS } from "@shared/notifications/tools";
import { FILE_TOOL_VIEWS } from "@shared/files/tools";
import { GIT_TOOL_VIEWS } from "@shared/git/tools";
import { WORKTREE_TOOL_VIEWS } from "@shared/worktrees/tools";
import { NOTE_TOOL_VIEWS } from "@shared/notes/tools";
import { DB_TOOL_VIEWS } from "@shared/database/tools";
import { TERMINAL_TOOL_VIEWS } from "@shared/terminal/tools";
import { BROWSER_TOOL_VIEWS } from "@shared/browser/tools";

/** 全部の機能のツールの表示の表 */
export const AI_TOOL_VIEWS: readonly AiToolView[] = [
  ...CHAT_TOOL_VIEWS,
  ...GUARD_TOOL_VIEWS,
  ...SNIPPET_TOOL_VIEWS,
  ...VISUAL_TOOL_VIEWS,
  ...WORKPLACE_MOVE_TOOL_VIEWS,
  ...USER_VIEW_TOOL_VIEWS,
  ...NOTIFICATION_TOOL_VIEWS,
  ...FILE_TOOL_VIEWS,
  ...GIT_TOOL_VIEWS,
  ...WORKTREE_TOOL_VIEWS,
  ...NOTE_TOOL_VIEWS,
  ...DB_TOOL_VIEWS,
  ...TERMINAL_TOOL_VIEWS,
  ...BROWSER_TOOL_VIEWS,
];
