// GitHub の PR の「レビューコメントで直す」: PR のブランチのワークツリーで作業するチャットの入力欄に、一言とレビューコメントの札を入れる。
// 送るのは自分で。ほかの渡し先（新しいチャット・このチャット・子チャット・ほかのチャット）は共通の「AI に渡す」（features/chat/handoff）
import type { GitHubLink } from "@shared/chat/types";
import type { GitHubPullDetail, GitHubReviewThread } from "@shared/github/types";
import { api } from "@/foundation/ui/api";
import { open } from "@/foundation/ui/navigation/open";
import { currentChats } from "@/features/chat/ui/store/knownChats";
import { worktreesStore } from "@/foundation/ui/workplace/worktreesStore";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { openSeededChat } from "@/features/chatPanel/ui/openSeededChat";
import { appendToDraft } from "@/features/composer/ui";
import { captureNameOf, reviewDocument, reviewFixText, sourceOf } from "./githubPrompt";

/**
 * レビューコメントで直す: PR のブランチのワークツリー（なければその場で作る。fork の PR も）で作業しているチャットの入力欄に、
 * 一言と解決していない行のコメントの札（押した時点の中身）を入れて開く（そのチャットがなければ、そのワークツリーで新しいチャットを始める）。
 * チャットは PR に結び付ける。threads を渡せばそのスレッドだけ
 */
export async function fixReviewComments(projectId: number, detail: GitHubPullDetail, link: GitHubLink, threads?: GitHubReviewThread[]) {
  const fail = reportFailure("PR のブランチのワークツリーを用意できませんでした");
  const [place, attachment] = await Promise.all([
    api.githubPullWorktree(projectId, detail.item.number).catch((e: unknown) => {
      fail(e);
      return null;
    }),
    api
      .capture({ name: captureNameOf(detail, true), mime: "text/markdown", text: reviewDocument(detail, threads), source: sourceOf(detail, true) })
      .catch((e: unknown) => {
        reportFailure("レビューコメントを取れませんでした")(e);
        return null;
      }),
  ]);
  if (!place || !attachment) return;
  worktreesStore.invalidate(projectId);
  const text = reviewFixText(detail);
  // そのワークツリーのチャット（この PR に結び付いたもの → 最近動いたもの）
  const here = currentChats({ projectId }).filter((c) => c.worktree_path === place.worktree_path && c.archived_at === null);
  const chat = here.find((c) => c.github_kind === "pr" && c.github_number === link.number && c.github_repo === link.repo) ?? here[0];
  if (!chat) {
    openSeededChat(projectId, place.worktree_path ? { kind: "existing", path: place.worktree_path } : { kind: "main" }, { text, attachments: [attachment], link });
    return;
  }
  appendToDraft(chat.id, text, [attachment]);
  open({ kind: "chat", projectId: chat.project_id, chatId: chat.id });
  if (chat.github_number === null) void api.setChatGitHub(chat.id, link).catch(reportFailure("GitHub との結び付きを保存できませんでした"));
}
