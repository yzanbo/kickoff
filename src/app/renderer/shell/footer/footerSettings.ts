// 殻がアプリの設定に出す欄（「表示」の下の帯）と、下の帯に出す項目（オフライン）。registry が直に足す
import type { SettingsItemDef } from "@/features/settings/ui";
import type { FooterItem } from "@/foundation/ui/shell/points";
import { FooterModeField } from "./FooterModeField";
import { OfflineNotice } from "./OfflineNotice";

export const footerModeItem: SettingsItemDef = { id: "shell.footerMode", section: "display", order: 200, Component: FooterModeField };
export const offlineFooterItem: FooterItem = { id: "offline", side: "start", order: 30, Item: OfflineNotice };
