// worktrees が拡張点に出すもの（app/renderer/registry.ts が入れる）: 下の帯のブランチ・作業場所の飾り（ワークツリーの実行環境・作る / 消す）
import { footerItems } from "@/foundation/ui/shell/points";
import { workplaceDecor } from "@/foundation/ui/workplace/workplaceDecor";
import { branchFooterItem } from "./footerItems";
import { worktreeEnvDecor } from "./workplaceDecor";
import { worktreeActionsDecor } from "./worktreeActions";

export const contributes = [footerItems.item(branchFooterItem), workplaceDecor.item(worktreeEnvDecor), workplaceDecor.item(worktreeActionsDecor)];
