// devices が拡張点に出すもの（app/renderer/registry.ts が入れる）: アプリの設定の節・下の帯の接続の札
import { footerItems } from "@/foundation/ui/shell/points";
import { settingsSections } from "@/features/settings/ui";
import { mobileSection } from "./settings/appSettings";
import { connectionFooterItem } from "./footerItems";

export const contributes = [settingsSections.item(mobileSection), footerItems.item(connectionFooterItem)];
