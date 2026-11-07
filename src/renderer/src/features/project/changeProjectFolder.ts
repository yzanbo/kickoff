import type { Project } from "@shared/types";
import { api } from "@/api";
import { currentChats } from "@/stores/chats";
import { worktreesStore } from "@/stores/worktrees";
import { alertDialog, choiceDialog, confirmDialog, reportFailure } from "@/ui/dialogs";
import { GIT_FEATURES } from "./GitInitNotice";

/**
 * プロジェクトのフォルダ（本体）を選び直す（見出しのフォルダの場所・プロジェクトの設定の「フォルダ」から）。
 * フォルダを選ぶ → 点検（取り込みと同じ。選んだフォルダをそのまま本体にする: git のリポジトリの中のフォルダなら、Git の操作をその中だけに絞る。
 * ほかのプロジェクトのフォルダは断る）→ 確かめてから変える。ファイルは移さない（空のフォルダを選んだら、そう伝える）。
 * git でない・コミットがないフォルダ（リポジトリの一番上）は、git の管理を始めて変える（最初のコミットを作る）か、git なしで変えるかを選ぶ。
 * チャット・設定はそのまま引き継ぐ。ワークツリーのチャットは、同じリポジトリの中なら同じワークツリーの中の新しいフォルダ、そうでなければ本体で続く（コアが付け替える）
 */
export async function changeProjectFolder(project: Project): Promise<void> {
  const picked = await window.kickoff?.dialog.pickFolder("プロジェクトのフォルダを選ぶ");
  if (!picked) return;
  try {
    const info = await api.inspectWorkspace(picked);
    if (!info.exists || !info.is_directory) return void (await alertDialog("フォルダが見つかりません", info.path));
    const target = info.path;
    // 登録済みかはコアが実体のパスで比べる（/tmp → /private/tmp など、登録したパスがシンボリックリンクを含んでいても見分ける）
    const owner = info.registered_project_id ?? null;
    if (owner === project.id) return void (await alertDialog("いまと同じフォルダです", target));
    if (owner !== null) {
      return void (await alertDialog("ほかのプロジェクトのフォルダです", `${target}\n\nこのフォルダは別のプロジェクトとして登録されています。`));
    }
    const inner = Boolean(info.git_root && info.git_root !== info.path);
    const needsGit = !inner && (!info.is_git || !info.has_commits);
    const notes = [
      ...(info.empty ? ["⚠ 選んだフォルダは空です。ファイルは移しません。いまのフォルダの中身を使うなら、Finder で移してから選び直してください。", ""] : []),
      `いま: ${project.repo_path}`,
      `新しい: ${target}`,
      ...(inner ? [`（git のリポジトリ ${info.git_root} の中のフォルダです。変更・履歴・ワークツリーは、このフォルダの中だけを扱います）`] : []),
      "",
      "チャット・設定はそのまま引き継ぎます。本体で作業するチャットは、次の指示から新しいフォルダで動きます（会話は続きます）。",
      ...(await worktreeNote(project, info.git_root)),
      ...(needsGit
        ? [
            "",
            info.is_git
              ? "このフォルダにはコミットがまだありません。git の管理を始める（いまあるファイルで最初のコミットを作る）かを選んでください。"
              : "このフォルダは git で管理されていません。git の管理を始める（リポジトリとして初期化し、最初のコミットを作る）かを選んでください。",
            `始めないと、${GIT_FEATURES}は使えません（あとから始められます）。`,
          ]
        : []),
    ];
    const title = "プロジェクトのフォルダを変えますか？";
    const message = notes.join("\n");
    // git で管理していなければ、始めるか・始めないかを選んで変える
    const choice = needsGit
      ? await choiceDialog({
          title,
          message,
          choices: [
            { value: "plain", label: "git なしで変更" },
            { value: "git", label: "git の管理を始めて変更", primary: true },
          ],
        })
      : (await confirmDialog({ title, message, confirmLabel: "変更" }))
        ? "keep"
        : null;
    if (choice === null) return;
    await api.setProjectRepoPath(project.id, { path: target, init_git: choice === "git" });
    // ワークツリーの作業場所（path）は本体のフォルダから決まるので、すぐ取り直す
    worktreesStore.invalidate(project.id);
  } catch (e) {
    await reportFailure("フォルダを変えられませんでした")(e);
  }
}

/** ワークツリーで作業しているチャットがどうなるか（同じリポジトリの中で変えるなら同じワークツリーの中、そうでなければ本体で続く）。なければ空 */
async function worktreeNote(project: Project, nextRoot: string | null): Promise<string[]> {
  const count = currentChats({ projectId: project.id }).filter((chat) => chat.worktree_path).length;
  if (count === 0) return [];
  const top = (await api.gitWorktrees(project.id).catch(() => [])).find((w) => w.main)?.root;
  return top && top === nextRoot
    ? [`ワークツリーで作業しているチャット ${count} 件は、同じワークツリーの中の新しいフォルダで続けます（そのブランチにフォルダがなければ本体で続けます）。`]
    : [`ワークツリーで作業しているチャット ${count} 件は、新しいフォルダの本体で続けます（ワークツリーのフォルダとファイルは消しません）。`];
}
