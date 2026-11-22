// worktrees が下の帯に出す項目: 本体のブランチ
import type { FooterItem } from "@/foundation/ui/shell/points";
import { FooterBranch } from "./FooterBranch";

export const branchFooterItem: FooterItem = { id: "branch", side: "start", order: 50, Item: FooterBranch };
