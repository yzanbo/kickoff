import type { Project } from "@shared/types";
import { api } from "@/api";
import { alertDialog, confirmDialog, reportFailure } from "@/ui/dialogs";

/**
 * プロジェクトのフォルダ（本体）を選び直す（見出しのフォルダの場所・プロジェクトの設定の「フォルダ」から）。
 * フォルダを選ぶ → 点検（取り込みと同じ。git のリポジトリの中ならルートにする・ほかのプロジェクトのフォルダは断る）→ 確かめてから変える。
 * git でない・コミットがないフォルダは、確かめの文で初期化（最初のコミット）を伝え、同意したら初期化する。チャット・設定はそのまま引き継ぐ
 */
export async function changeProjectFolder(project: Project): Promise<void> {
  const picked = await window.kickoff?.dialog.pickFolder("プロジェクトのフォルダを選ぶ");
  if (!picked) return;
  try {
    const info = await api.inspectWorkspace(picked);
    if (!info.exists || !info.is_directory) return void (await alertDialog("フォルダが見つかりません", info.path));
    const target = info.git_root ?? info.path;
    // 登録済みかはコアが実体のパスで比べる（/tmp → /private/tmp など、登録したパスがシンボリックリンクを含んでいても見分ける）
    const owner = info.registered_project_id ?? null;
    if (owner === project.id) return void (await alertDialog("いまと同じフォルダです", target));
    if (owner !== null) {
      return void (await alertDialog("ほかのプロジェクトのフォルダです", `${target}\n\nこのフォルダは別のプロジェクトとして登録されています。`));
    }
    const initGit = !info.is_git || !info.has_commits;
    const notes = [
      `いま: ${project.repo_path}`,
      `新しい: ${target}`,
      ...(info.git_root && info.git_root !== info.path ? [`（選んだフォルダは git のリポジトリの中なので、ルートのフォルダにします）`] : []),
      "",
      "チャット・設定はそのまま引き継ぎます。本体で作業するチャットは、次の指示から新しいフォルダで動きます（会話は続きます）。ワークツリーのチャットの作業場所は変わりません。",
      ...(initGit
        ? ["", info.is_git ? "このフォルダにはコミットがまだないので、最初のコミットを作ります。" : "このフォルダは git で管理されていないので、git のリポジトリとして初期化し、最初のコミットを作ります。"]
        : []),
    ];
    const ok = await confirmDialog({ title: "プロジェクトのフォルダを変えますか？", message: notes.join("\n"), confirmLabel: "変更" });
    if (!ok) return;
    await api.setProjectRepoPath(project.id, { path: target, init_git: initGit });
  } catch (e) {
    await reportFailure("フォルダを変えられませんでした")(e);
  }
}
