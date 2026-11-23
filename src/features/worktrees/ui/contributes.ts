// worktrees が拡張点に出すもの（app/renderer/registry.ts が入れる）: 下の帯のブランチ・作業場所の飾り（ワークツリーの実行環境・帯・作る / 消す）・ゴミ箱の控えの行
import { footerItems } from "@/foundation/ui/shell/points";
import { workplaceDecor } from "@/foundation/ui/workplace/workplaceDecor";
import { branchFooterItem } from "./footerItems";
import { worktreesDecor } from "./workplaceDecor";
import { trashKinds } from "@/features/trash/ui";
import { worktreeTrashKind } from "./trashKind";

export const contributes = [footerItems.item(branchFooterItem), workplaceDecor.item(worktreesDecor), trashKinds.item(worktreeTrashKind)];
