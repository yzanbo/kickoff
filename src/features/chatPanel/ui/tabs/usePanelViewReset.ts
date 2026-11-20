import { useSyncExternalStore } from "react";
import type { Setting } from "@/foundation/ui/storage";
import { readSetting, subscribeSetting, writeSetting } from "@/foundation/ui/storage";
import { storage } from "@/features/chatPanel/ui/storage";
import { panelSettings } from "@/features/panel/ui";
import { chatListSettings } from "@/features/chatList/ui";
import { PANEL_TAB_GROUP_COLORS, PANEL_VIEW_BUTTON_HIDDEN } from "@/foundation/ui/storage/storageKeys";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import type { PanelSurface } from "@/features/panel/ui/surfaces";

/**
 * 「表示」のメニューのチャットの項目が読む設定（まとめ方は欄ごとなので別に見る）。
 * チャットの画面の表示（タブの列・見出し・指示の帯など）はこのメニューから外したので戻さない（チャットの見出しの右クリック・設定の「表示」で選ぶ）
 */
const CHAT_VIEW_SETTINGS: readonly Setting<unknown>[] = [
  chatListSettings.order,
  storage.settings.showArchived,
  storage.settings.hiddenGroups,
  storage.settings.hideEmptyGroups,
  storage.settings.clusterShort,
  PANEL_TAB_GROUP_COLORS,
  panelSettings.tabHidden,
  panelSettings.tabTwoLine,
  panelSettings.tabOverflow,
] as Setting<unknown>[];

/** 初めの値と同じか（保存する形で比べる。一覧の順も含めて同じ形で保存するので、そのまま比べてよい） */
const atInitial = <T>(setting: Setting<T>, value: T) => setting.encode(value) === setting.encode(setting.initial);

/** チャットの項目の設定のどれかが変わったら知らせる（useSyncExternalStore の購読） */
function subscribeChatView(listener: () => void) {
  const offs = CHAT_VIEW_SETTINGS.map((s) => subscribeSetting(s, listener));
  return () => offs.forEach((off) => off());
}
/** チャットの項目の設定がすべて初めの値か */
const chatViewAtInitial = () => CHAT_VIEW_SETTINGS.every((s) => atInitial(s, readSetting(s)));

/**
 * タブの列の「表示」のメニューのいちばん下の「既定に戻す」: メニューに出ている選び方（チャットのまとめ方・並び順（サイドバーと共通）・出すグループ・タブに出す項目・
 * アーカイブ済み・まとまりの色と名前の省略・2 行で表示・タブが増えたとき）と「表示」ボタンを初めの値に戻す。chat はチャットの項目を出している欄か（出していない欄では、「表示」ボタンだけを戻す）。
 * changed は初めと違う選び方があるか（なければ押せない）
 */
export function usePanelViewReset(surface: PanelSurface, chat: boolean) {
  const groupingSetting = storage.settings.tabGrouping(surface);
  const [grouping] = useSetting(groupingSetting);
  // 「表示」ボタンを出すか（どの欄のメニューにも出すので、チャットを出さない欄でも戻す）
  const [buttonHidden] = useSetting(PANEL_VIEW_BUTTON_HIDDEN);
  // チャットの項目の設定がすべて初めの値か（どれが変わってもメニューを描き直す。hook を並べて呼ばない）
  const chatViewInitial = useSyncExternalStore(subscribeChatView, chatViewAtInitial);
  const chatChanged = chat && (!atInitial(groupingSetting, grouping) || !chatViewInitial);
  return {
    changed: chatChanged || buttonHidden !== PANEL_VIEW_BUTTON_HIDDEN.initial,
    reset: () => {
      writeSetting(PANEL_VIEW_BUTTON_HIDDEN, PANEL_VIEW_BUTTON_HIDDEN.initial);
      if (!chat) return;
      writeSetting(groupingSetting, groupingSetting.initial);
      for (const s of CHAT_VIEW_SETTINGS) writeSetting(s, s.initial);
    },
  };
}
