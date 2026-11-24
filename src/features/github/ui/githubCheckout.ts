// PR のチェックアウト: 取るたびに新しいワークツリー / 本体を選び（既定の印は付けない）、本体ならまだコミットしていない変更と
// 本体で作業中のチャットを確認で知らせる。fork の PR も取れる（コアが pr-N に取ってくる）。取ったら、その作業場所で新しいチャットを始めるボタンを出す
import type { GitHubPullDetail } from "@shared/github/types";
import { githubApi } from "@/features/github/ui/api/github";
import { gitApi } from "@/features/git/ui";
import { workdirInput } from "@/foundation/ui/api/workdir";
import { useChatsWithChildren } from "@/features/chat/ui/store/knownChats";
import { chatTitle } from "@/features/chat/ui/chatTitle";
import { worktreesStore } from "@/foundation/ui/workplace/worktreesStore";
import { choose, confirm, reportFailure } from "@/foundation/ui/kit/ask";
import { openSeededChat } from "@/features/chatPanel/ui/openSeededChat";
import { mainCheckoutNotes } from "./githubMerge";
import { linkOf } from "./githubPrompt";

/** チェックアウトの流れ（running は本体で作業中のチャットの名前。呼ぶ側がチャットの店から渡す） */
export async function checkoutPull(projectId: number, detail: GitHubPullDetail, running: string[]) {
  const n = detail.item.number;
  const place = await choose({
    title: `PR #${n} のブランチをどこに取り出しますか？`,
    message: `ブランチ ${detail.item.head_ref} を取り出して、手元で動かして確かめられるようにします。新しいワークツリーなら、本体の作業はそのままです。`,
    choices: [
      { value: "worktree", label: "新しいワークツリー" },
      { value: "main", label: "本体" },
    ],
  }).then((r) => r?.value ?? null);
  if (!place) return;
  if (place === "main") {
    const status = await gitApi("GET /api/projects/:projectId/git/status", workdirInput(projectId)).catch(() => null);
    const changes = status?.repo ? new Set([...status.staged, ...status.unstaged, ...status.conflicts].map((f) => f.path)).size : 0;
    const notes = mainCheckoutNotes(changes, running);
    if (notes.length > 0) {
      const ok = await confirm({ title: "本体のブランチを切り替えますか？", message: ["本体のブランチを PR のブランチに切り替えます。", "", "注意:", ...notes].join("\n"), confirmLabel: "切り替える" });
      if (!ok) return;
    }
  }
  const result = await githubApi.githubCheckout(projectId, n, place).catch((e: unknown) => {
    void reportFailure("PR のブランチを取り出せませんでした")(e);
    return null;
  });
  if (!result) return;
  worktreesStore.invalidate(projectId);
  const where = result.worktree_path ? `ワークツリー（${result.worktree_path}）` : "本体";
  const start = await choose({
    title: "PR のブランチを取り出しました",
    message: `ブランチ ${result.branch} を${where}に取り出しました。`,
    choices: [{ value: "chat", label: "ここで新しいチャット", primary: true }],
  }).then((r) => r?.value ?? null);
  if (start) openSeededChat(projectId, result.worktree_path ? { kind: "existing", path: result.worktree_path } : { kind: "main" }, { text: "", link: linkOf(detail) });
}

/** 本体で作業中のチャットの名前（子チャットも。チェックアウトの確認に使う） */
export function useMainRunningChats(projectId: number): string[] {
  return useChatsWithChildren()
    .filter((c) => c.project_id === projectId && c.worktree_path === null && c.status === "running")
    .map((c) => chatTitle(c.title));
}
