import type { Project } from "@shared/types";
import { api } from "@/api";
import { alertDialog, choiceDialog, confirmDialog, reportFailure } from "@/ui/dialogs";
import { GIT_FEATURES } from "./GitInitNotice";

/**
 * プロジェクトのフォルダ（本体）を選び直す（見出しのフォルダの場所・プロジェクトの設定の「フォルダ」から）。
 * フォルダを選ぶ → 点検（取り込みと同じ。git のリポジトリの中ならルートにする・ほかのプロジェクトのフォルダは断る）→ 確かめてから変える。
 * git でない・コミットがないフォルダは、git の管理を始めて変える（最初のコミットを作る）か、git なしで変えるかを選ぶ。チャット・設定はそのまま引き継ぐ
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
    const needsGit = !info.is_git || !info.has_commits;
    const notes = [
      `いま: ${project.repo_path}`,
      `新しい: ${target}`,
      ...(info.git_root && info.git_root !== info.path ? [`（選んだフォルダは git のリポジトリの中なので、ルートのフォルダにします）`] : []),
      "",
      "チャット・設定はそのまま引き継ぎます。本体で作業するチャットは、次の指示から新しいフォルダで動きます（会話は続きます）。ワークツリーのチャットの作業場所は変わりません。",
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
  } catch (e) {
    await reportFailure("フォルダを変えられませんでした")(e);
  }
}
