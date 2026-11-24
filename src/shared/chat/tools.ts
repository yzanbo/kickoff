// チャットの AI のツール（kickoff_chat）のうち chat が持つものの、画面とスマホに出す表示名と記録の行の文
import { aiToolViewOf, type AiToolView } from "@shared/foundation/aiToolView";
import { AI_LIST_FAMILY_TOOL, AI_UPDATE_CHAT_TOOL, describeUpdateChat } from "./aiChatEdit";
import { AI_ARCHIVE_CHAT_TOOL, AI_DELETE_CHAT_TOOL, describeRemoveChat } from "./aiChatRemove";
import { AI_CHAT_RELATION_LABELS, AI_CREATE_CHAT_TOOL, relationOf } from "./aiCreateChat";
import { AI_ADD_DRAFT_TOOL, AI_OPEN_CHAT_TOOL, describeAddDraft, describeOpenChat } from "./aiOpen";
import { AI_LIST_PROJECT_CHATS_TOOL, AI_READ_CHAT_TOOL, AI_USAGE_TOOL, describeReadChat } from "./aiRead";

const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** AI が作ったチャットの行の文（何を作ったか・名前か依頼の 1 行目・ワークツリーのブランチ。「子チャット「ログの調査」（ワークツリー feat/a）」） */
function describeCreateChat(input: Record<string, unknown>): string {
  const name = str(input.title) || str(input.text).split("\n")[0];
  const relation = relationOf(input);
  const branch = str(input.worktree_branch);
  return `${relation ? AI_CHAT_RELATION_LABELS[relation] : ""}「${name}」${branch ? `（ワークツリー ${branch}）` : ""}`;
}

/** chat の機能のツールの表示の表（使用枠を確かめる get_usage も、名前がここにあるので置く） */
export const CHAT_TOOL_VIEWS: readonly AiToolView[] = [
  aiToolViewOf(AI_CREATE_CHAT_TOOL, "チャットを作る", describeCreateChat),
  aiToolViewOf(AI_LIST_FAMILY_TOOL, "同じ家系のチャットを確かめる"),
  // どのチャットの何を変えたか（「名前を『…』に変えた・固定した（チャット 12）」）
  aiToolViewOf(AI_UPDATE_CHAT_TOOL, "チャットを変更", describeUpdateChat),
  aiToolViewOf(AI_OPEN_CHAT_TOOL, "チャットを開く", describeOpenChat),
  aiToolViewOf(AI_LIST_PROJECT_CHATS_TOOL, "プロジェクトのチャットを確かめる"),
  // どのチャットを、どこからさかのぼって読んだか（「チャット 12（38 回目より前）」）
  aiToolViewOf(AI_READ_CHAT_TOOL, "チャットの会話を読む", describeReadChat),
  aiToolViewOf(AI_USAGE_TOOL, "使用枠を確かめる"),
  aiToolViewOf(AI_ADD_DRAFT_TOOL, "下書きを入れる", describeAddDraft),
  // どのチャットか（予約したか・一緒に扱った子チャットの数は結果の欄）
  aiToolViewOf(AI_ARCHIVE_CHAT_TOOL, "チャットをアーカイブ", describeRemoveChat),
  aiToolViewOf(AI_DELETE_CHAT_TOOL, "チャットをゴミ箱へ", describeRemoveChat),
];
