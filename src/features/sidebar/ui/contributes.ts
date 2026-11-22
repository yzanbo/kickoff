// sidebar が拡張点に出すもの（app/renderer/registry.ts が入れる）: サイドバーの別ウィンドウ
import { popoutKinds } from "@/foundation/ui/navigation/popout";
import { sidebarPopout } from "./popoutKinds";

export const contributes = [popoutKinds.item(sidebarPopout)];
