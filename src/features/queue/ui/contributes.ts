// queue が拡張点に出すもの（app/renderer/registry.ts が入れる）: 下の帯の再開の確かめ
import { footerItems } from "@/foundation/ui/shell/points";
import { restartResumeFooterItem } from "./footerItems";

export const contributes = [footerItems.item(restartResumeFooterItem)];
