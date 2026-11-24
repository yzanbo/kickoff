// settings が下の帯に出す項目: 設定の歯車（いちばん左）
import type { FooterItem } from "@/foundation/ui/shell/points";
import { SettingsFooterButton } from "./SettingsFooterButton";

export const settingsFooterItem: FooterItem = { id: "settings", side: "start", order: 10, Item: SettingsFooterButton };
