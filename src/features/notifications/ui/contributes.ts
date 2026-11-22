// notifications が拡張点に出すもの（app/renderer/registry.ts が入れる）: アプリの設定の節
import { settingsSections } from "@/features/settings/ui";
import { notificationsSection } from "./settings/appSettings";
import { appHosts } from "@/foundation/ui/shell/points";
import { notificationsHost } from "./appHosts";

export const contributes = [settingsSections.item(notificationsSection), appHosts.item(notificationsHost)];
