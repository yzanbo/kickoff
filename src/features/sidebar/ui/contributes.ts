// sidebar が拡張点に出すもの（app/renderer/registry.ts が入れる）: サイドバーの別ウィンドウ・コマンド
import { popoutKinds } from "@/foundation/ui/navigation/popout";
import { sidebarPopout } from "./popoutKinds";
import { sidebarCommands } from "./commands";

export const contributes = [popoutKinds.item(sidebarPopout), ...sidebarCommands];
