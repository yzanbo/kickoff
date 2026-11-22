// worktrees が拡張点に出すもの（app/renderer/registry.ts が入れる）: 下の帯の本体のブランチ
import { footerItems } from "@/foundation/ui/shell/points";
import { branchFooterItem } from "./footerItems";

export const contributes = [footerItems.item(branchFooterItem)];
