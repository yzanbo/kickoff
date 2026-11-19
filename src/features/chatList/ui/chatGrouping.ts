import type { SettingValue } from "@/foundation/ui/storage/settings";
import { SIDEBAR_CHAT_SECTIONS } from "@/foundation/ui/storage/storageKeys";

/**
 * チャットのまとめ方（none = まとめない / group = グループ別 / worktree = 作業場所別）。
 * サイドバーのチャット一覧と右のパネルのタブの列で共通（どちらも「チャットのまとめ方」。覚えるのは別々）
 */
export type ChatGrouping = SettingValue<typeof SIDEBAR_CHAT_SECTIONS>;
export const CHAT_GROUPINGS = SIDEBAR_CHAT_SECTIONS.choices;
export const CHAT_GROUPING_LABELS: Record<ChatGrouping, string> = { none: "まとめない", group: "グループ別", worktree: "作業場所別" };
