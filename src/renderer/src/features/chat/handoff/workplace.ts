// 「AI に渡す」の「新しいチャットで始める」: 作業場所を選んで、文と添付を入れた新しいチャットのタブを開く（送るのは自分で）
import type { Attachment, GitHubLink } from "@shared/types";
import { api } from "@/api";
import { parsePopout } from "@/app/popout";
import { postToMainWindow } from "@/app/windowBus";
import { choiceDialog } from "@/ui/dialogs";
import { panelActions } from "@/features/panel/state/panelActions";
import { openDraft } from "@/features/panel/state/panelDrafts";
import { panelKey } from "@/features/panel/surfaces";
import { askNewWorktreeBranch, type Workplace } from "@/features/worktree/WorkplacePicker";

/** 作業場所を選ぶ（新しいワークツリー / 本体 / いまあるワークツリー）。やめたら null。branch は新しいワークツリーの名前の案 */
export async function chooseWorkplace(projectId: number, branch: string): Promise<Workplace | null> {
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
 * 文と添付を入れた新しいチャットのタブを、プロジェクトのチャットのパネルに開く（画面に出ていなければ、その画面へ移る）。
 * link は作るチャットに結び付ける issue・PR（text が空なら入力欄は空のまま。チェックアウトのあとの「ここで新しいチャット」）。
 * 別ウィンドウ（DB クライアントなど）の中からは、メインのウィンドウに頼む
 */
export function openSeededChat(projectId: number, place: Workplace, seed: { text: string; attachments?: Attachment[]; link?: GitHubLink | null }) {
  if (parsePopout(location.hash)) {
    postToMainWindow({ type: "openSeededChat", projectId, place, text: seed.text, attachments: seed.attachments ?? [], link: seed.link ?? null });
    return;
  }
  const panel = panelKey("board", projectId);
  const key = panelActions(panel).openNew(
    { projectId, ...(place.kind === "existing" ? { worktree: place.path } : {}) },
    {
      text: seed.text,
      attachments: seed.attachments ?? [],
      ...(seed.link ? { github: seed.link } : {}),
      ...(place.kind === "new" ? { newWorktreeBranch: place.branch } : {}),
    },
  );
  openDraft({ panel, key });
}
