import type { Project } from "@shared/types";
import { api } from "@/api";
import { currentChats } from "@/stores/chats";
import { currentProjects } from "@/stores/projects";
import { worktreesStore } from "@/stores/worktrees";
import { alertDialog, confirmDialog, confirmWithCheck, reportFailure } from "@/ui/dialogs";
import { folderOverlapLines, folderOverlaps } from "./folderOverlaps";
import { gitInitChoice } from "./gitInitChoice";

/**
 * プロジェクトのフォルダ（本体）を選び直す（見出しのフォルダの場所・プロジェクトの設定の「フォルダ」から）。
 * フォルダを選ぶ → 点検（取り込みと同じ。選んだフォルダをそのまま本体にする: git のリポジトリの中のフォルダなら、Git の操作をその中だけに絞る。
 * ほかのプロジェクトと同じフォルダは断り（プロジェクトフォルダは DB で重ねられない）、その中・中にあるフォルダは確かめの頭で知らせて変えられる（利用者の依頼）→ 確かめてから変える。ファイルは移さない（空のフォルダを選んだら、そう伝える）。
 * git の管理を始めるかは、取り込みと同じチェック（gitInitChoice。初めはオフ）で選ぶ: git でない・コミットがないフォルダは初期化して最初のコミットを作るか、
 * リポジトリの中のフォルダは親のリポジトリの中のフォルダとして使うか、このフォルダで別のリポジトリとして始めるか。
 * チャット・設定はそのまま引き継ぐ。ワークツリーのチャットは、同じリポジトリの中なら同じワークツリーの中の新しいフォルダ、そうでなければ本体で続く（コアが付け替える）
 */
export async function changeProjectFolder(project: Project): Promise<void> {
  // 何のために選ぶのかを窓の上の文とボタンで伝える（見出しのフォルダの場所を押しただけでは、フォルダを変えることが分かりにくいため）
  const picked = await window.kickoff?.dialog.pickFolder("プロジェクトフォルダを変更", {
    message: `「${project.name}」のプロジェクトフォルダを変更します。新しいフォルダを選んでください（いま: ${project.repo_path}）。ファイルは移しません。`,
    buttonLabel: "このフォルダに変更",
    defaultPath: project.repo_path,
  });
  if (!picked) return;
  try {
    const info = await api.inspectWorkspace(picked);
    if (!info.exists || !info.is_directory) return void (await alertDialog("フォルダが見つかりません", info.path));
    const target = info.path;
    // 登録済みかはコアが実体のパスで比べる（/tmp → /private/tmp など、登録したパスがシンボリックリンクを含んでいても見分ける）
    const owner = info.registered_project_id ?? null;
    if (owner === project.id) return void (await alertDialog("いまと同じフォルダです", target));
    if (owner !== null) {
      const name = currentProjects().find((p) => p.id === owner)?.name ?? "ほか";
      return void (await alertDialog("ほかのプロジェクトのフォルダです", `${target}\n\nこのフォルダは「${name}」のプロジェクトフォルダです。同じフォルダを 2 つのプロジェクトで使うことはできません。`));
    }
    // ほかのプロジェクトのフォルダの中・中にある（変えられるので、確かめの頭で知らせる）
    const overlaps = folderOverlapLines(folderOverlaps(target, currentProjects(), project.id), "warn").map((line) => `⚠ ${line.text}`);
    const inner = Boolean(info.git_root && info.git_root !== info.path);
    const worktrees = await worktreeChats(project, info.git_root);
    const notes = [
      ...(overlaps.length > 0 ? [...overlaps, ""] : []),
      ...(info.empty ? ["⚠ 選んだフォルダは空です。ファイルは移しません。いまのフォルダの中身を使うなら、Finder で移してから選び直してください。", ""] : []),
      `いま: ${project.repo_path}`,
      `新しい: ${target}`,
      ...(inner ? [`（git のリポジトリ ${info.git_root} の中のフォルダです）`] : []),
      "",
      "チャット・設定はそのまま引き継ぎます。本体で作業するチャットは、次の指示から新しいフォルダで動きます（会話は続き、AI にも新しいプロジェクトフォルダを伝えます）。",
      ...(worktrees.count > 0 ? [worktrees.sameRepo ? WORKTREE_SAME(worktrees.count) : WORKTREE_MAIN(worktrees.count)] : []),
    ];
    const title = "プロジェクトフォルダを変えますか？";
    const message = notes.join("\n");
    // git の管理を始めるかは、取り込みと同じチェックで選ぶ（初めはオフ。もうコミットのあるリポジトリの一番上なら出さない）
    const choice = gitInitChoice(info);
    const decided = choice
      ? await confirmWithCheck({
          title,
          message,
          confirmLabel: "変更",
          check: {
            label: choice.label,
            // 中のフォルダで別のリポジトリにすると、同じワークツリーの中では続けられない
            help: (checked) => choice.help(checked) + (checked && inner && worktrees.count > 0 && worktrees.sameRepo ? ` ${WORKTREE_MAIN(worktrees.count)}` : ""),
          },
        })
      : (await confirmDialog({ title, message, confirmLabel: "変更" }))
        ? { checked: false }
        : null;
    if (decided === null) return;
    await api.setProjectRepoPath(project.id, { path: target, init_git: decided.checked });
    // ワークツリーの作業場所（path）は本体のフォルダから決まるので、すぐ取り直す
    worktreesStore.invalidate(project.id);
  } catch (e) {
    await reportFailure("フォルダを変えられませんでした")(e);
  }
}

const WORKTREE_SAME = (count: number) => `ワークツリーで作業しているチャット ${count} 件は、同じワークツリーの中の新しいフォルダで続けます（そのブランチにフォルダがなければ本体で続けます）。`;
const WORKTREE_MAIN = (count: number) => `ワークツリーで作業しているチャット ${count} 件は、新しいフォルダの本体で続けます（ワークツリーのフォルダとファイルは消しません）。`;

/** ワークツリーで作業しているチャットの数と、新しいフォルダがいまと同じリポジトリか（同じなら、同じワークツリーの中の新しいフォルダで続く） */
async function worktreeChats(project: Project, nextRoot: string | null): Promise<{ count: number; sameRepo: boolean }> {
  const count = currentChats({ projectId: project.id }).filter((chat) => chat.worktree_path).length;
  if (count === 0) return { count, sameRepo: false };
  const top = (await api.gitWorktrees(project.id).catch(() => [])).find((w) => w.main)?.root;
  return { count, sameRepo: Boolean(top && top === nextRoot) };
}
