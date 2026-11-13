// CI の「AI に渡す」: 渡すもの（落ちたステップのログの札と一言）と、「（ブランチ名）で直す」（そのブランチの作業場所のチャットの入力欄に入れる）。
// 送るのは自分で。ほかの渡し先（新しいチャット・このチャット・子チャット・ほかのチャット）は共通の「AI に渡す」（features/chat/handoff）
import type { Attachment, CiRun } from "@shared/types";
import { api } from "@/api";
import { openChat } from "@/app/router";
import { currentChats } from "@/stores/chats";
import { worktreesStore } from "@/stores/worktrees";
import { reportFailure } from "@/ui/dialogs";
import type { HandOffItem } from "@/features/chat/handoff/handOff";
import { openSeededChat } from "@/features/chat/handoff/workplace";
import { addToChat } from "@/features/chat/pane/addToChat";
import { ciCaptureName, ciFailedDocument, ciFixText, ciHandOffText, ciLinkOf, runName } from "./ciView";

/** 押した時点の落ちたステップのログを札にする（外から来た中身。鍵らしい値はコアが伏せる。長ければ終わりを多めに残す） */
async function captureFailedLog(projectId: number, run: CiRun): Promise<Attachment> {
  const log = await api.ciFailedLog(projectId, run.id);
  return api.capture({
    name: ciCaptureName(run),
    mime: "text/markdown",
    text: ciFailedDocument(log),
    source: { type: "ci_log", label: `${runName(run)}（${run.branch ?? "ブランチなし"}）の失敗ログ`, url: run.url },
    // ログの原因は終わりの方に出ることが多い
    tail_share: 0.8,
  });
}

/** 共通の「AI に渡す」に渡すもの（新しいチャットは作業場所を選ぶ。案はそのブランチ。既定のブランチなら聞かずに本体） */
export function ciHandOffItem(projectId: number, run: CiRun, repo: string, defaultBranch: string | null): HandOffItem {
  return {
    projectId,
    what: `${runName(run)} の落ちたステップのログ`,
    text: ciHandOffText(run),
    capture: () => captureFailedLog(projectId, run),
    link: ciLinkOf(run, repo),
    branch: run.branch && run.branch !== defaultBranch ? run.branch : undefined,
  };
}

/**
 * （ブランチ名）で直す: そのブランチの作業場所（既定のブランチなら本体。ほかはワークツリー。なければコアがその場で作る）で
 * 作業しているチャット（アーカイブしていないもの。実行の PR に結び付いたもの → 最近動いたもの）の入力欄に、一言と失敗ログの札を入れて開く。
 * チャットがなければ、その作業場所で新しいチャットのタブを開く（GitHub の「レビューコメントで直す」と同じ流れ）
 */
export async function fixCiRun(projectId: number, run: CiRun, repo: string) {
  const [place, attachment] = await Promise.all([
    api.ciRunWorktree(projectId, run.id).catch((e: unknown) => {
      reportFailure(`${run.branch ?? "ブランチ"} の作業場所を用意できませんでした`)(e);
      return null;
    }),
    captureFailedLog(projectId, run).catch((e: unknown) => {
      reportFailure("CI の失敗ログを取れませんでした")(e);
      return null;
    }),
  ]);
  if (!place || !attachment) return;
  worktreesStore.invalidate(projectId);
  const text = ciFixText(run);
  const link = ciLinkOf(run, repo);
  const here = currentChats({ projectId }).filter((c) => c.worktree_path === place.worktree_path && c.archived_at === null);
  const chat = (link && here.find((c) => c.github_kind === "pr" && c.github_number === link.number && c.github_repo === link.repo)) || here[0];
  if (!chat) {
    openSeededChat(projectId, place.worktree_path ? { kind: "existing", path: place.worktree_path } : { kind: "main" }, { text, attachments: [attachment], link });
    return;
  }
  addToChat(chat.id, text, [attachment]);
  openChat(chat.project_id, chat.id);
  if (link && chat.github_number === null) void api.setChatGitHub(chat.id, link).catch(reportFailure("GitHub との結び付きを保存できませんでした"));
}
