// ports が拡張点に出すもの（app/renderer/registry.ts が入れる）: ⌘K の「ポートを使っているプロセス」・下の帯のポート
import { footerItems } from "@/foundation/ui/shell/points";
import { portsCommand } from "./commands";
import { portsFooterItem } from "./footerItems";

export const contributes = [portsCommand, footerItems.item(portsFooterItem)];
