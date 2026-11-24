// files がプロジェクトの画面の表（projectViews）に出す画面の中身: ファイル・検索（変更の画面も同じ Page を git が出す）
import type { ViewScope } from "@/features/panel/ui";
import type { ProjectViewContext } from "@/features/projects/ui";
import { EditorTab } from "./EditorTab";

/**
 * ファイル・検索・変更のタブの中身（3 つの画面の Page。同じ部品のまま左の一覧の表示だけ変えるので、行き来しても開いたファイル・検索などは共有する。
 * 作業場所を変えたら、選んでいたファイル・検索などは初めからにする）。
 * 開いたファイルのタブは置き場所ごとに別に覚える: 真ん中はプロジェクト、右サイドバーは作業場所ごと、チャットの右の欄はチャットと画面ごと
 */
export function EditorViewPage({ view, place, project, chatId, worktree, setWorktree, stale, openFile }: ProjectViewContext) {
  const path = worktree ?? undefined;
  const panelScope: ViewScope | undefined = place === "rightSidebar" ? `view-side-${project.id}-${worktree ?? "main"}` : place === "chatSide" ? `view-${chatId}-${view}` : undefined;
  return (
    <EditorTab
      key={worktree ?? ""}
      view={view as "files" | "search" | "changes"}
      projectId={project.id}
      repoPath={project.repo_path}
      worktree={path}
      onWorktreeChange={(next) => setWorktree(next ?? null)}
      // 別のプロジェクトを読み込んでいる途中・作業場所を切り替えるまでは渡さない
      openFile={!stale && openFile?.worktree === path ? openFile : undefined}
      panelScope={panelScope}
      // チャットの右の欄の中（その右の欄を持つチャットが足す先。送る前のチャットにはない）
      inSide={place === "chatSide" && chatId !== undefined}
    />
  );
}
