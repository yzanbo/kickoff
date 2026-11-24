// settings が拡張点に出すもの（app/renderer/registry.ts が入れる）: ⌘, 設定・「表示」の節とテーマの欄・下の帯の歯車
import { commands } from "@/foundation/ui/commands";
import { appHosts, footerItems } from "@/foundation/ui/shell/points";
import { openSettings } from "./openSettings";
import { settingsItems, settingsSections } from "./points";
import { displaySection, themeItem } from "./appSettings";
import { settingsFooterItem } from "./footerItems";
import { settingsHost } from "./appHosts";

export const contributes = [
  commands.item({ id: "settings.open", title: "設定", keys: "mod+,", run: () => openSettings("usage") }),
  settingsSections.item(displaySection),
  settingsItems.item(themeItem),
  footerItems.item(settingsFooterItem),
  appHosts.item(settingsHost),
];
