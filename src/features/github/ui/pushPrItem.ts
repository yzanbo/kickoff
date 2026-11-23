// 履歴の手元のブランチの右クリックの「プッシュして PR を作る」（git の branchMenuItems に登録する）
import type { BranchMenuItem } from "@/features/git/ui";
import { confirm } from "@/foundation/ui/kit/ask";
import { githubApi } from "./api/github";

export const pushPrItem: BranchMenuItem = {
  id: "github.pushPr",
  label: (_, remote) => `プッシュして「${remote}」に PR を作る`,
  busyLabel: "PR の作成",
  confirm: async (branch) => Boolean(await confirm({ title: `「${branch}」をプッシュして PR を作る`, message: "プッシュしてから、GitHub に PR を作ります（タイトルと本文はコミットから）。", confirmLabel: "PR を作る" })),
  send: async (target, branch) => {
    const pr = await githubApi.createPullRequest(target, branch);
    return { title: `PR #${pr.number} を作りました`, message: `${pr.title}\n${pr.url}` };
  },
};
