import type { Setting } from "@/lib/storage";
import { writeSetting } from "@/lib/storage";
import {
  CHAT_FONT_SIZE,
  CHAT_HEADER_HIDDEN,
  CHAT_HEADER_ORDER,
  CHAT_HEADER_ROW_HIDDEN,
  CHAT_TAB_ROW_HIDDEN,
  CHAT_WIDE,
  COMPOSER_COMPACT,
  PANEL_HIDDEN_GROUPS,
  PANEL_HIDE_EMPTY_GROUPS,
  PANEL_TAB_GROUP_COLORS,
  SIDEBAR_SHOW_ARCHIVED,
  SNIPPET_BAR_HIDDEN,
  STICKY_PROMPT_HIDDEN,
  panelTabGrouping,
  panelTabKinds,
} from "@/lib/storageKeys";
import { useSetting } from "@/hooks/useSetting";
import { decodeKinds } from "@/features/panel/state/panelKinds";
import { SURFACES, type PanelSurface } from "@/features/panel/surfaces";

/** 「表示」のメニューのチャットの項目が読む設定（まとめ方と表示するタブは欄ごとなので別に見る） */
const CHAT_VIEW_SETTINGS: readonly Setting<unknown>[] = [
  SIDEBAR_SHOW_ARCHIVED,
  PANEL_HIDDEN_GROUPS,
  PANEL_HIDE_EMPTY_GROUPS,
  PANEL_TAB_GROUP_COLORS,
  CHAT_TAB_ROW_HIDDEN,
  CHAT_HEADER_ROW_HIDDEN,
  CHAT_HEADER_HIDDEN,
  CHAT_HEADER_ORDER,
  STICKY_PROMPT_HIDDEN,
  SNIPPET_BAR_HIDDEN,
  CHAT_FONT_SIZE,
  CHAT_WIDE,
  COMPOSER_COMPACT,
] as Setting<unknown>[];

/** 初めの値と同じか（保存する形で比べる。一覧の順も含めて同じ形で保存するので、そのまま比べてよい） */
const atInitial = <T>(setting: Setting<T>, value: T) => setting.encode(value) === setting.encode(setting.initial);

/**
 * タブの列の「表示」のメニューのいちばん下の「既定に戻す」: メニューに出ている選び方（表示するタブ・チャットのまとめ方・出すグループ・
 * アーカイブ済み・まとまりの色・チャットの画面の項目）を初めの値に戻す。chat はチャットの項目を出している欄か（出していない欄では、表示するタブだけを戻す）。
 * changed は初めと違う選び方があるか（なければ押せない）
 */
export function usePanelViewReset(surface: PanelSurface, chat: boolean) {
  const kindsSetting = panelTabKinds(surface);
  const groupingSetting = panelTabGrouping(surface);
  const [storedKinds] = useSetting(kindsSetting);
  const [grouping] = useSetting(groupingSetting);
  // 設定の数は決まっているので、hook を並べて呼ぶ（どれが変わってもメニューを描き直す）
  const values = CHAT_VIEW_SETTINGS.map((s) => useSetting(s)[0]);
  const rules = SURFACES[surface];
  const kindsChanged = !rules.fixedKinds && decodeKinds(storedKinds, surface).join() !== rules.defaultKinds.join();
  const chatChanged = chat && (!atInitial(groupingSetting, grouping) || CHAT_VIEW_SETTINGS.some((s, i) => !atInitial(s, values[i])));
  return {
    changed: kindsChanged || chatChanged,
    reset: () => {
      if (!rules.fixedKinds) writeSetting(kindsSetting, kindsSetting.initial);
      if (!chat) return;
      writeSetting(groupingSetting, groupingSetting.initial);
      for (const s of CHAT_VIEW_SETTINGS) writeSetting(s, s.initial);
    },
  };
}
