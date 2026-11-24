// チャットのパネルがアプリの設定に出す欄: 「表示」のタブの列・タブの列の「表示」ボタン
import type { SettingsItemDef } from "@/features/settings/ui";
import { ChatTabRowField, PanelViewButtonField } from "./DisplayFields";

export const chatPanelDisplayItems: SettingsItemDef[] = [
  { id: "chatPanel.tabRow", section: "display", order: 50, Component: ChatTabRowField },
  { id: "chatPanel.viewButton", section: "display", order: 60, Component: PanelViewButtonField },
];
