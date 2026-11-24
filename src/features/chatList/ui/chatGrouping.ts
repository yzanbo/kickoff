import type { SettingValue } from "@/foundation/ui/storage";
import { storage } from "./storage";

/**
 * チャットのまとめ方（none = まとめない / group = グループ別 / worktree = 作業場所別）。
 * サイドバーのチャット一覧と右のパネルのタブの列で共通（どちらも「チャットのまとめ方」。覚えるのは別々）
 */
export type ChatGrouping = SettingValue<typeof storage.settings.sections>;
export const CHAT_GROUPINGS = storage.settings.sections.choices;
export const CHAT_GROUPING_LABELS: Record<ChatGrouping, string> = { none: "まとめない", group: "グループ別", worktree: "作業場所別" };
