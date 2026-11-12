// GitHub の issue・PR を AI に渡す操作（要件 5.11 の段階 2）: 新しいチャット（作業場所を選ぶ）・チャットに追加・レビューコメントで直す。
// どれも文を入力欄に入れるだけで、送るのは自分で
import type { Chat, GitHubLink, GitHubPullDetail, GitHubReviewThread } from "@shared/types";
import { api } from "@/api";
import { openChat } from "@/app/router";
import { readSetting, writeSetting } from "@/lib/storage";
import { chatDraft } from "@/lib/storageKeys";
import { currentChats } from "@/stores/chats";
import { worktreesStore } from "@/stores/worktrees";
import { choiceDialog, reportFailure } from "@/ui/dialogs";
import { appendBlock } from "@/features/chat/messages/quoteComment";
import { chatPaneOf } from "@/features/chat/pane/windowMessages";
import { panelActions } from "@/features/panel/state/panelActions";
import { openDraft } from "@/features/panel/state/panelDrafts";
import { panelKey } from "@/features/panel/surfaces";
import { askNewWorktreeBranch, type Workplace } from "@/features/worktree/WorkplacePicker";
import { reviewFixPrompt } from "./githubPrompt";

/** 作業場所を選ぶ（新しいワークツリー / 本体 / いまあるワークツリー）。やめたら null。branch は新しいワークツリーの名前の案 */
async function chooseWorkplace(projectId: number, branch: string): Promise<Workplace | null> {
  const worktrees = (await api.gitWorktrees(projectId).catch(() => [])).filter((w) => !w.main && !w.prunable && w.branch);
  const picked = await choiceDialog({
    title: "どこで作業しますか",
    message: "ほかのチャットと並行して進めるなら、新しいワークツリーがおすすめです（ファイルがぶつかりません）。",
    choices: [
      { value: "new", label: "新しいワークツリー", primary: true },
      { value: "main", label: "本体" },
      ...(worktrees.length > 0 ? [{ value: "existing", label: "いまあるワークツリー…" }] : []),
    ],
  });
  if (picked === "main") return { kind: "main" };
  if (picked === "new") {
    const name = await askNewWorktreeBranch(projectId, branch);
    return name ? { kind: "new", branch: name } : null;
  }
  if (picked !== "existing") return null;
  const path = await choiceDialog({
    title: "どのワークツリーで作業しますか",
    choices: worktrees.map((w) => ({ value: w.path, label: w.branch ?? w.path })),
  });
  return path ? { kind: "existing", path } : null;
}

/**
 * 文を入れた新しいチャットのタブを、プロジェクトのチャットのパネルに開く（画面に出ていなければ、その画面へ移る）。
 * link は作るチャットに結び付ける issue・PR
 */
function openSeededChat(projectId: number, place: Workplace, text: string, link: GitHubLink) {
  const panel = panelKey("board", projectId);
  const key = panelActions(panel).openNew(
    { projectId, ...(place.kind === "existing" ? { worktree: place.path } : {}) },
    { text, attachments: [], github: link, ...(place.kind === "new" ? { newWorktreeBranch: place.branch } : {}) },
  );
  openDraft({ panel, key });
}

/** 新しいチャットで始める（作業場所を選んでから、文を入れた新しいチャットのタブを開く。送ったチャットは link に結び付く） */
export async function startChatWith(projectId: number, text: string, link: GitHubLink) {
  const place = await chooseWorkplace(projectId, `${link.kind === "issue" ? "issue" : "pr"}-${link.number}`);
  if (place) openSeededChat(projectId, place, text, link);
}

/**
 * チャットの入力欄の後ろに足して、そのチャットを開く（画面がまだなければ書きかけの文に足しておき、開いたときに入る）。
 * まだどれにも結び付いていないチャットなら link に結び付ける
 */
export function addToChatWith(chat: Pick<Chat, "id" | "project_id" | "github_number">, text: string, link: GitHubLink) {
  const pane = chatPaneOf(chat.id);
  if (pane) pane.fillComposer(text, { append: true });
  else writeSetting(chatDraft(chat.id), appendBlock(readSetting(chatDraft(chat.id)), text));
  openChat(chat.project_id, chat.id);
  if (chat.github_number === null) void api.setChatGitHub(chat.id, link).catch(reportFailure("GitHub との結び付きを保存できませんでした"));
}

/**
 * レビューコメントで直す: PR のブランチのワークツリー（なければその場で作る。fork の PR も）で作業しているチャットの入力欄に、
 * 解決していない行のコメントを入れる（そのチャットがなければ、そのワークツリーで新しいチャットを始める）。チャットは PR に結び付ける
 */
export async function fixReviewComments(projectId: number, detail: GitHubPullDetail, link: GitHubLink, threads?: GitHubReviewThread[]) {
  const fail = reportFailure("PR のブランチのワークツリーを用意できませんでした");
  const place = await api.githubPullWorktree(projectId, detail.item.number).catch((e: unknown) => {
    fail(e);
    return null;
  });
  if (!place) return;
  worktreesStore.invalidate(projectId);
  const text = reviewFixPrompt(detail, threads);
  // そのワークツリーのチャット（この PR に結び付いたもの → 最近動いたもの）
  const here = currentChats({ projectId }).filter((c) => c.worktree_path === place.worktree_path);
  const chat = here.find((c) => c.github_kind === "pr" && c.github_number === link.number && c.github_repo === link.repo) ?? here[0];
  if (!chat) return openSeededChat(projectId, place.worktree_path ? { kind: "existing", path: place.worktree_path } : { kind: "main" }, text, link);
  addToChatWith(chat, text, link);
}
