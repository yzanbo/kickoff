import { Clock, Folder, GitBranch, List, ListTree, type LucideIcon } from "lucide-react";
import { useSetting } from "@/hooks/useSetting";
import type { SettingValue } from "@/lib/storage";
import { TAB_GROUPING_LABELS } from "@/features/panel/clusters/tabClusters";
import { SIDEBAR_CHAT_ORDER, SIDEBAR_CHAT_SECTIONS } from "@/lib/storageKeys";

/**
 * サイドバーのチャット一覧は、2 つの設定の組み合わせで並べる（すべてのプロジェクトに効く）:
 * まとめ方（外側の見出し）= まとめない / 自分で作ったグループ / 作業場所（ブランチ）、
 * 並び順（その中の並び）= 新しい順 / 状態別（作業中・回答待ち・未読・既読の見出しに分ける）
 */
export const CHAT_SECTIONS = SIDEBAR_CHAT_SECTIONS.choices;
export type ChatSections = SettingValue<typeof SIDEBAR_CHAT_SECTIONS>;
export type ChatOrder = SettingValue<typeof SIDEBAR_CHAT_ORDER>;

/** label: メニューの項目 / short: 見出しの行のボタンに出す、いまの値 */
/** 選択肢の名前は右のパネルのタブのまとめ方（TAB_GROUPING_LABELS）と同じ（まとめない / グループ別 / 作業場所別。どちらも「チャットのまとめ方」） */
export const SECTIONS_META: Record<ChatSections, { label: string; short: string; icon: LucideIcon }> = {
  none: { label: TAB_GROUPING_LABELS.none, short: TAB_GROUPING_LABELS.none, icon: List },
  group: { label: TAB_GROUPING_LABELS.group, short: TAB_GROUPING_LABELS.group, icon: Folder },
  worktree: { label: TAB_GROUPING_LABELS.worktree, short: TAB_GROUPING_LABELS.worktree, icon: GitBranch },
};
export const ORDER_META: Record<ChatOrder, { short: string; icon: LucideIcon }> = {
  recent: { short: "新しい順", icon: Clock },
  status: { short: "状態別", icon: ListTree },
};

/** チャット一覧のまとめ方と並び順（部品どうしでそろう。初めはグループ別 × 新しい順） */
export function useChatLayout() {
  const [sections, setSections] = useSetting(SIDEBAR_CHAT_SECTIONS);
  const [order, setOrder] = useSetting(SIDEBAR_CHAT_ORDER);
  return { sections, setSections, order, setOrder };
}
