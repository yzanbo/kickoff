// GitHub の PR の「レビューコメントで直す」: PR のブランチのワークツリーで作業するチャットの入力欄に、一言とレビューコメントの札を入れる。
// 送るのは自分で。ほかの渡し先（新しいチャット・このチャット・子チャット・ほかのチャット）は共通の「AI に渡す」（features/chat/handoff）
import type { Attachment, GitHubLink } from "@shared/chat/types";
import type { GitHubPullDetail, GitHubReviewThread } from "@shared/github/types";
import { githubApi } from "@/features/github/ui/api/github";
import { open } from "@/foundation/ui/navigation/open";
import { currentChats, chatsApi } from "@/features/chat/ui";
import { worktreesStore } from "@/foundation/ui/workplace/worktreesStore";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { appendToDraft } from "@/features/composer/ui";
import { captureNameOf, reviewDocument, reviewFixText, sourceOf } from "./githubPrompt";
import { uploadsApi } from "@/features/attachments/ui";
import { openSeededChat } from "@/features/chatPanel/ui";

/**
 * レビューコメントで直す: PR のブランチのワークツリー（なければその場で作る。fork の PR も）で作業しているチャットの入力欄に、
 * 一言と解決していない行のコメントの札（押した時点の中身）を入れて開く（そのチャットがなければ、そのワークツリーで新しいチャットを始める）。
 * チャットは PR に結び付ける。threads を渡せばそのスレッドだけ
 */
export async function fixReviewComments(projectId: number, detail: GitHubPullDetail, link: GitHubLink, threads?: GitHubReviewThread[]) {
  const fail = reportFailure("PR のブランチのワークツリーを用意できませんでした");
  const [place, attachment] = await Promise.all([
    githubApi.githubPullWorktree(projectId, detail.item.number).catch((e: unknown) => {
      fail(e);
      return null;
    }),
    uploadsApi
      .capture({ name: captureNameOf(detail, true), mime: "text/markdown", text: reviewDocument(detail, threads), source: sourceOf(detail, true) })
      .catch((e: unknown) => {
        reportFailure("レビューコメントを取れませんでした")(e);
        return null;
      }),
  ]);
  if (!place || !attachment) return;
  handOffToWorkplaceChat(projectId, place.worktree_path, reviewFixText(detail), attachment, link);
}

/**
 * そのブランチの作業場所のチャットの入力欄に、一言と札を入れて開く（GitHub の「レビューコメントで直す」・CI の「（ブランチ名）で直す」）。
 * チャットはその作業場所のアーカイブしていないもの（link の PR に結び付いたもの → 最近動いたもの）。なければ、その作業場所で新しいチャットのタブを開く。
 * まだ結び付いていなければ link に結び付ける
 */
export function handOffToWorkplaceChat(projectId: number, worktreePath: string | null, text: string, attachment: Attachment, link: GitHubLink | undefined) {
  worktreesStore.invalidate(projectId);
  const here = currentChats({ projectId }).filter((c) => c.worktree_path === worktreePath && c.archived_at === null);
  const chat = (link && here.find((c) => c.github_kind === "pr" && c.github_number === link.number && c.github_repo === link.repo)) || here[0];
  if (!chat) {
    openSeededChat(projectId, worktreePath ? { kind: "existing", path: worktreePath } : { kind: "main" }, { text, attachments: [attachment], link });
    return;
  }
  appendToDraft(chat.id, text, [attachment]);
  open({ kind: "chat", projectId: chat.project_id, chatId: chat.id });
  if (link && chat.github_number === null) void chatsApi.setChatGitHub(chat.id, link).catch(reportFailure("GitHub との結び付きを保存できませんでした"));
}
