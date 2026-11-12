// PR のチェックアウト（要件 5.11 の段階 3・決定 ⑧）: 取るたびに新しいワークツリー / 本体を選び（既定の印は付けない）、本体ならまだコミットしていない変更と
// 本体で作業中のチャットを確認で知らせる。fork の PR も取れる（コアが pr-N に取ってくる）。取ったら、その作業場所で新しいチャットを始めるボタンを出す
import type { GitHubPullDetail } from "@shared/types";
import { api } from "@/api";
import { useChatsWithChildren } from "@/stores/chats";
import { chatTitle } from "@/features/chat/chatTitle";
import { worktreesStore } from "@/stores/worktrees";
import { choiceDialog, confirmDialog, reportFailure } from "@/ui/dialogs";
import { openSeededChat } from "@/features/chat/handoff/workplace";
import { mainCheckoutNotes } from "./githubMerge";
import { linkOf } from "./githubPrompt";

/** チェックアウトの流れ（running は本体で作業中のチャットの名前。呼ぶ側がチャットの店から渡す） */
export async function checkoutPull(projectId: number, detail: GitHubPullDetail, running: string[]) {
  const n = detail.item.number;
  const place = await choiceDialog({
    title: `PR #${n} のブランチをどこに取り出しますか？`,
    message: `ブランチ ${detail.item.head_ref} を取り出して、手元で動かして確かめられるようにします。新しいワークツリーなら、本体の作業はそのままです。`,
    choices: [
      { value: "worktree", label: "新しいワークツリー" },
      { value: "main", label: "本体" },
    ],
  });
  if (!place) return;
  if (place === "main") {
    const status = await api.gitStatus(projectId).catch(() => null);
    const changes = status?.repo ? new Set([...status.staged, ...status.unstaged, ...status.conflicts].map((f) => f.path)).size : 0;
    const notes = mainCheckoutNotes(changes, running);
    if (notes.length > 0) {
      const ok = await confirmDialog({ title: "本体のブランチを切り替えますか？", message: ["本体のブランチを PR のブランチに切り替えます。", "", "注意:", ...notes].join("\n"), confirmLabel: "切り替える" });
      if (!ok) return;
    }
  }
  const result = await api.githubCheckout(projectId, n, place).catch((e: unknown) => {
    void reportFailure("PR のブランチを取り出せませんでした")(e);
    return null;
  });
  if (!result) return;
  worktreesStore.invalidate(projectId);
  const where = result.worktree_path ? `ワークツリー（${result.worktree_path}）` : "本体";
  const start = await choiceDialog({
    title: "PR のブランチを取り出しました",
    message: `ブランチ ${result.branch} を${where}に取り出しました。`,
    choices: [{ value: "chat", label: "ここで新しいチャット", primary: true }],
  });
  if (start) openSeededChat(projectId, result.worktree_path ? { kind: "existing", path: result.worktree_path } : { kind: "main" }, { text: "", link: linkOf(detail) });
}

/** 本体で作業中のチャットの名前（子チャットも。チェックアウトの確認に使う） */
export function useMainRunningChats(projectId: number): string[] {
  return useChatsWithChildren()
    .filter((c) => c.project_id === projectId && c.worktree_path === null && c.status === "running")
    .map((c) => chatTitle(c.title));
}
