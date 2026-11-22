// settings が拡張点に出すもの（app/renderer/registry.ts が入れる）: ⌘, 設定
import { commands } from "@/foundation/ui/commands";
import { openSettings } from "./openSettings";
import { settingsItems, settingsSections } from "./points";
import { displaySection, themeItem } from "./appSettings";

export const contributes = [commands.item({ id: "settings.open", title: "設定", keys: "mod+,", run: () => openSettings("usage") }), settingsSections.item(displaySection), settingsItems.item(themeItem)];
