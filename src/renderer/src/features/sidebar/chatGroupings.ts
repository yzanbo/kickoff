import { Clock, Folder, GitBranch, List, ListTree, type LucideIcon } from "lucide-react";
import { useSharedChoice } from "@/hooks/useStoredState";
import { TAB_GROUPING_LABELS } from "@/features/panel/clusters/tabClusters";
import { SIDEBAR_CHAT_ORDER_KEY, SIDEBAR_CHAT_SECTIONS_KEY, SIDEBAR_GROUPING_KEY } from "@/lib/storageKeys";

/**
 * サイドバーのチャット一覧は、2 つの設定の組み合わせで並べる（すべてのプロジェクトに効く）:
 * まとめ方（外側の見出し）= まとめない / 自分で作ったグループ / 作業場所（ブランチ）、
 * 並び順（その中の並び）= 新しい順 / 状態別（作業中・回答待ち・未読・既読の見出しに分ける）
 */
export const CHAT_SECTIONS = ["none", "group", "worktree"] as const;
export type ChatSections = (typeof CHAT_SECTIONS)[number];
export const CHAT_ORDERS = ["recent", "status"] as const;
export type ChatOrder = (typeof CHAT_ORDERS)[number];

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

/** 以前の 1 つにまとめた設定（グループの中を 新しい順 / 状態 / 作業場所 で分けていた）。新しい 2 つの設定がまだないときの初めの値に読み替える */
const LEGACY_GROUPINGS = ["recent", "status", "worktree"] as const;

/** チャット一覧のまとめ方と並び順（部品どうしでそろう） */
export function useChatLayout() {
  const [legacy] = useSharedChoice(SIDEBAR_GROUPING_KEY, LEGACY_GROUPINGS, "recent");
  const [sections, setSections] = useSharedChoice<ChatSections>(SIDEBAR_CHAT_SECTIONS_KEY, CHAT_SECTIONS, legacy === "worktree" ? "worktree" : "group");
  const [order, setOrder] = useSharedChoice<ChatOrder>(SIDEBAR_CHAT_ORDER_KEY, CHAT_ORDERS, legacy === "status" ? "status" : "recent");
  return { sections, setSections, order, setOrder };
}
