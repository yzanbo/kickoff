// OS の砂場の拒否を AI が調べるツールの、画面とスマホに出す表示名
import { aiToolViewOf, type AiToolView } from "@shared/foundation/aiToolView";
import { AI_READ_SANDBOX_DENIALS_TOOL, AI_START_SANDBOX_DIAGNOSTICS_TOOL } from "./aiSandboxDiagnostics";

/** 守りの機能のツールの表示の表 */
export const GUARD_TOOL_VIEWS: readonly AiToolView[] = [
  aiToolViewOf(AI_START_SANDBOX_DIAGNOSTICS_TOOL, "OS の拒否ログの診断を始める"),
  aiToolViewOf(AI_READ_SANDBOX_DENIALS_TOOL, "OS の拒否ログを読む"),
];
