// updates が拡張点に出すもの（app/renderer/registry.ts が入れる）: 設定の節「Kickoff について」・設定の上の帯・⚙ の印・メインの知らせを受ける hook
import { settingsItems, settingsSections } from "@/features/settings/ui";
import { appHosts } from "@/foundation/ui/shell/points";
import { aboutSection, updateBadgeItem, updateBannerItem, updatesHost } from "./appSettings";

export const contributes = [settingsSections.item(aboutSection), settingsItems.item(updateBannerItem), settingsItems.item(updateBadgeItem), appHosts.item(updatesHost)];
