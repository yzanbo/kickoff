import { hiddenItemsOf, toggleHiddenItem } from "@/lib/hiddenItems";
import type { SettingValue } from "@/lib/storage";
import type { SIDEBAR_CHAT_SECTIONS } from "@/lib/storageKeys";

// タブに出す項目（タブの列の「表示」のメニューの「タブに出す項目」で、項目ごとに出す・隠すを選ぶ。利用者の依頼）。
// 覚えるのは隠した項目だけ（PANEL_TAB_HIDDEN。すべてのパネルで共通）。名前・種類の札（メモ・サブ・子）はいつも出す

export const TAB_FIELDS = ["state", "children", "pin", "group", "worktree"] as const;
export type TabField = (typeof TAB_FIELDS)[number];

export const TAB_FIELD_LABELS: Record<TabField, string> = {
  state: "状態",
  children: "子チャット",
  pin: "ピン留め",
  group: "グループ",
  worktree: "作業場所（ブランチ）",
};

/** タブのまとめ方（なし / グループ別 / 作業場所別） */
type TabGrouping = SettingValue<typeof SIDEBAR_CHAT_SECTIONS>;

/**
 * まとめ方で、設定にかかわらず隠す項目（グループ別ならグループ・作業場所別なら作業場所。まとまりの札に出るので、タブに重ねて出さない）。
 * 隠すのは表示だけで、保存した選び方は変えない（別のまとめ方にすれば、選んだとおりに出る）
 */
export function groupedTabField(grouping: TabGrouping): TabField | null {
  return grouping === "group" ? "group" : grouping === "worktree" ? "worktree" : null;
}

/** タブにその項目を出すか（隠した項目と、まとめ方で隠す項目は出さない） */
export function tabFieldShown(field: TabField, saved: readonly string[], grouping: TabGrouping): boolean {
  return field !== groupedTabField(grouping) && !hiddenTabFields(saved).has(field);
}

export const hiddenTabFields = (saved: readonly string[]): ReadonlySet<TabField> => hiddenItemsOf(TAB_FIELDS, saved);
export const toggleTabField = (saved: readonly string[], field: TabField): TabField[] => toggleHiddenItem(TAB_FIELDS, saved, field);
