import { Clock, Folder, GitBranch, GripVertical, List, ListTree, type LucideIcon } from "lucide-react";
import { useSetting } from "@/hooks/useSetting";
import type { SettingValue } from "@/lib/storage";
import { CHAT_GROUPING_LABELS, type ChatGrouping } from "@/features/chatList/chatGrouping";
import { SIDEBAR_CHAT_ORDER, SIDEBAR_CHAT_SECTIONS } from "@/lib/storageKeys";

/**
 * サイドバーのチャット一覧は、2 つの設定の組み合わせで並べる（すべてのプロジェクトに効く）:
 * まとめ方（外側の見出し）= まとめない / 自分で作ったグループ / 作業場所（ブランチ）、
 * 並び順（その中の並び）= 最近動いた順 / 状態順（作業中・回答待ち・未読・既読の見出しに分けて並べる）/ 手動（ドラッグで並べた順。Chat.position）。「〜順」は並べる順、「〜別」（まとめ方）は見出しに分ける
 */
export type ChatOrder = SettingValue<typeof SIDEBAR_CHAT_ORDER>;

/** label: メニューの項目 / short: 見出しの行のボタンに出す、いまの値 */
/** 選択肢の名前は右のパネルのタブのまとめ方と同じ（CHAT_GROUPING_LABELS。どちらも「チャットのまとめ方」） */
export const GROUPING_META: Record<ChatGrouping, { label: string; short: string; icon: LucideIcon }> = {
  none: { label: CHAT_GROUPING_LABELS.none, short: CHAT_GROUPING_LABELS.none, icon: List },
  group: { label: CHAT_GROUPING_LABELS.group, short: CHAT_GROUPING_LABELS.group, icon: Folder },
  worktree: { label: CHAT_GROUPING_LABELS.worktree, short: CHAT_GROUPING_LABELS.worktree, icon: GitBranch },
};
/** 並び順の選択肢（メニューの順） */
export const CHAT_ORDERS = SIDEBAR_CHAT_ORDER.choices;
export const ORDER_META: Record<ChatOrder, { label: string; short: string; icon: LucideIcon }> = {
  // ボタンの名前は短く（プロジェクトの並び順の「最近順」「手動」と同じ）。メニューでは「最近動いた順」
  recent: { label: "最近動いた順", short: "最近順", icon: Clock },
  status: { label: "状態順", short: "状態順", icon: ListTree },
  // まとまり（グループ・作業場所など）の中を、ドラッグで並べた順にする（利用者の依頼。最近順・状態順でもドラッグすると手動になる）
  manual: { label: "手動（ドラッグで並べた順）", short: "手動", icon: GripVertical },
};

/** チャット一覧のまとめ方と並び順（部品どうしでそろう。初めはグループ別 × 最近動いた順） */
export function useChatLayout() {
  const [grouping, setGrouping] = useSetting(SIDEBAR_CHAT_SECTIONS);
  const [order, setOrder] = useSetting(SIDEBAR_CHAT_ORDER);
  return { grouping, setGrouping, order, setOrder };
}
