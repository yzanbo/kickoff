import { useEffect, useEffectEvent, useState } from "react";
import { useChatPlacement } from "./chatPlacement";
import { ProjectEditDialog } from "@/features/projects/ui/settings/ProjectEditDialog";
import { ProjectHeader } from "./ProjectHeader";
import { ProjectTabs, useProjectTabsLayout } from "./ProjectTabs";
import { useProjectData } from "./useProjectData";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { MissingProject, NoProjectsWelcome } from "@/features/projects/ui/ProjectsEmpty";
import type { FileTarget, ProjectViewId, ReopenRoute } from "@/foundation/ui/navigation/router";
import { storage } from "@/features/projects/ui/storage";
import { resolveProjectView } from "@/features/projects/ui/projectViews";
import { ProjectViewHost } from "@/features/projects/ui/ProjectViewHost";
import { WindowHeaderContent } from "@/foundation/ui/shell/WindowHeaderContent";

interface ProjectPageProps {
  id: number;
  tab: ProjectViewId;
  /** カンバンの右側のパネルで開くチャット・新しいチャット（サイドバー・検索などから開いたとき） */
  focus?: ReopenRoute;
  /** ファイルタブで開くファイル（チャットの返答のファイルのチップから） */
  openFile?: FileTarget;
  /** ノートのタブで開くノート（チャットの「ノートに追加」から） */
  openNote?: string;
  /** そのノートで移る行（⌘K の「ノート内の文言」から） */
  openNoteLine?: number;
}

/**
 * プロジェクト画面: ボード（カンバン）・チャット（ボードと分ける置き方のとき）・ファイル・検索・変更（Git の変更とファイル。文書もここでファイルとして見る）・
 * 履歴（コミット）・ノートをタブで
 */
export function ProjectPage(props: ProjectPageProps) {
  // 一覧が届いたのに見つからないプロジェクト（消した・URL の番号が違う）は、前の画面を出さずに案内だけを出す
  // （中身の部品を出さないので、そのプロジェクトのグループ・Git の状態を読みに行かない）。プロジェクトが 1 つもなければ始め方の案内
  const { missing, projects } = useProjects();
  if (missing(props.id))
    return <div className="page page-wide">{projects.length === 0 ? <NoProjectsWelcome /> : <MissingProject id={props.id} />}</div>;
  return <ProjectPageBody {...props} />;
}

function ProjectPageBody({ id, tab: routeTab, focus, openFile, openNote, openNoteLine }: ProjectPageProps) {
  // チャットをボードの右で開く置き方では「チャット」タブはないので、そのタブの URL はボードで出す。DB・GitHub・Docker・CI のタブはこの Mac のアプリの中だけ
  // （ブラウザ・スマホから開いたらボード）。知らない画面の名前もボード
  const [placement] = useChatPlacement();
  const separate = placement === "separate";
  const { data: shown, error, loading } = useProjectData(id);
  // 別の画面へ移る前の書きかけ（ファイル・ノート・DB の表の変更など）の確かめは、ルーターの移動の前（viewLeave.ts の leaveProjectView）
  const tab: ProjectViewId = resolveProjectView(routeTab, separate)?.id ?? "board";
  const view = resolveProjectView(tab, separate);
  const [editing, setEditing] = useState(false);
  // ファイル・検索・変更・履歴・DB のタブで見る作業場所（ワークツリーのフォルダ。空なら本体。プロジェクトごとに覚える）
  const [storedWorktree, storeWorktree] = useSetting(storage.settings.workplace(id));
  const worktree = storedWorktree || null;
  const setWorktree = (path: string | null) => storeWorktree(path ?? "");
  // タブの置き方（見出しの下に横並び / 左に縦並び。設定の「表示」）
  const [tabsLayout] = useProjectTabsLayout();
  // 開くファイルが別の作業場所のものなら、先にその作業場所へ切り替える（切り替わってから中身に渡す）
  const followOpenFile = useEffectEvent(() => {
    if (openFile && (openFile.worktree ?? null) !== worktree) setWorktree(openFile.worktree ?? null);
  });
  useEffect(() => {
    followOpenFile();
  }, [openFile]);

  if (error && !shown) return <div className="page error">{error}</div>;
  if (!shown) return <div className="page muted">読み込み中…</div>;
  const { project } = shown;
  // 別のプロジェクトを読み込んでいる途中（前の画面を薄くして出しておく）
  const stale = project.id !== id;
  // タブの数のもの（変更の数は真ん中の作業場所の Git の状態、チャットの数を取り直している最中はプロジェクトの画面のデータの読み込み）
  const badge = { worktree, loading };

  return (
    <div className={`page page-wide page-board ${stale ? "is-stale" : ""}`}>
      <ProjectHeader data={shown} tab={tab} badge={badge} onEdit={() => setEditing(true)} />
      {/* タブを左に縦並びにする設定のときは、本体の左にアイコンだけで並べる（見出しの下の行がなくなり、本体の縦の幅が増える） */}
      <div className="project-main">
        {tabsLayout === "side" && <ProjectTabs projectId={project.id} tab={tab} badge={badge} vertical />}
        <div className="project-content">
          {view && <ProjectViewHost def={view} ctx={{ project, place: "center", worktree, setWorktree, stale, focus, openFile, openNote, openNoteLine }} />}
        </div>
      </div>
      {/* 最大表示で元の画面が隠れていても、見出しから開いた設定は操作できる位置へ出す */}
      {editing && <WindowHeaderContent><ProjectEditDialog project={project} onClose={() => setEditing(false)} /></WindowHeaderContent>}
    </div>
  );
}
