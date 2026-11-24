// devices が拡張点に出すもの（app/renderer/registry.ts が入れる）: アプリの設定の節「スマホ連携」・「接続」のサーバーのカード・下の帯の接続の札
import { footerItems } from "@/foundation/ui/shell/points";
import { settingsItems, settingsSections } from "@/features/settings/ui";
import { mobileSection, serverStatusItem } from "./settings/appSettings";
import { connectionFooterItem } from "./footer/footerItems";

export const contributes = [settingsSections.item(mobileSection), settingsItems.item(serverStatusItem), footerItems.item(connectionFooterItem)];
