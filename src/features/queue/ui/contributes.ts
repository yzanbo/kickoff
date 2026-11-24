// queue が拡張点に出すもの（app/renderer/registry.ts が入れる）: 起動したときの再開の確かめ（下の帯の札とアプリの根のダイアログ）
import { appHosts, footerItems } from "@/foundation/ui/shell/points";
import { restartResumeFooterItem } from "./footerItems";
import { restartResumeHost } from "./appHosts";

export const contributes = [footerItems.item(restartResumeFooterItem), appHosts.item(restartResumeHost)];
