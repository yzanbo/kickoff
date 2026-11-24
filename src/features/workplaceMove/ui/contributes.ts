// workplaceMove が拡張点に出すもの（app/renderer/registry.ts が入れる）
import { appHosts } from "@/foundation/ui/shell/points";
import { workplaceMoveTabsHost } from "./appHosts";

export const contributes = [appHosts.item(workplaceMoveTabsHost)];
