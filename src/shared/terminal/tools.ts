// 内蔵ターミナルを AI が読むツールの、画面とスマホに出す表示名と記録の行の文
import { aiToolViewOf, type AiToolView } from "@shared/foundation/aiToolView";
import { AI_LIST_TERMINALS_TOOL, AI_READ_TERMINAL_TOOL, describeReadTerminal } from "./aiTerminal";

/** ターミナルの機能のツールの表示の表 */
export const TERMINAL_TOOL_VIEWS: readonly AiToolView[] = [
  aiToolViewOf(AI_LIST_TERMINALS_TOOL, "ターミナルを確かめる"),
  // 読んだ行の数（省いたら既定なので付けない）
  aiToolViewOf(AI_READ_TERMINAL_TOOL, "ターミナルの出力を読む", describeReadTerminal),
];
