// ワークツリーを AI が片付けるツールの、画面とスマホに出す表示名と記録の行の文
import { aiToolViewOf, type AiToolView } from "@shared/foundation/aiToolView";
import { AI_FINISH_WORKTREE_TOOL, describeFinishWorktree } from "./aiWorktree";

/** ワークツリーの機能のツールの表示の表 */
export const WORKTREE_TOOL_VIEWS: readonly AiToolView[] = [
  // どのワークツリーか（省いたらこのチャットのワークツリー。結果（取り込み済みか・控え）は結果の欄とお知らせ）
  aiToolViewOf(AI_FINISH_WORKTREE_TOOL, "ワークツリーを片付ける", describeFinishWorktree),
];
