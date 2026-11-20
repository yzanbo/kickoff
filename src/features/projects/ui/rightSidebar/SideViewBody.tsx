import { FoldHorizontal, UnfoldHorizontal } from "lucide-react";
import { useEffect, useEffectEvent } from "react";
import { CiTab } from "@/features/github/ui/ci/CiTab";
import { LazyDatabaseClient } from "@/features/database/ui/LazyDatabaseClient";
import { DockerTab } from "@/features/docker/ui/DockerTab";
import { EditorTab } from "@/features/files/ui/EditorTab";
import { useGitStatus } from "@/features/git/ui/useGitStatus";
import { GitHubTab } from "@/features/github/ui/GitHubTab";
import { HistoryTab } from "@/features/git/ui/history/HistoryTab";
import { NoteTab } from "@/features/notes/ui/NoteTab";
import { sideNoteScope } from "@/features/notes/ui/notePanel";
import { TrashTab } from "@/features/trash/ui/TrashTab";
import { WorkplaceProvider } from "@/foundation/ui/workplace/workplaceContext";
import type { PanelFrame } from "@/features/panel/ui/PanelTools";
import { useOrderedProjectTabs } from "@/features/projects/ui/page/ProjectTabs";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { takeSideOpenRequest, useSideOpenRequest } from "./sideOpenRequests";
import { useSideWorktree } from "./useSideWorktree";
import type { SideView } from "./sideView";

/**
 * 右サイドバーのブラウザ以外の中身（プロジェクトのタブと同じ画面をそのまま描く）。
 * ファイル・検索・変更・履歴・DB は、真ん中に開いているチャットの作業場所に付いていく（useSideWorktree）。開いたファイルのタブは作業場所ごとに覚える。
 * 真ん中のプロジェクトのタブとは別の状態にする（ノート・ファイルのタブの欄は、右サイドバーだけの範囲 view-side-<プロジェクト>）。
 * 見ていない中身は描かない（裏で取り直し・見張りを続けない。開いていたもの・絞り込みは設定と欄の店に残る）
 */
export function SideViewBody({ projectId, view, frame }: { projectId: number; view: Exclude<SideView, "browser">; frame?: PanelFrame }) {
  const label = useOrderedProjectTabs().find((t) => t.tab === view);
  const maximize = frame?.maximize;
  return (
    <div className="side-view">
      <div className="side-view-head">
        {maximize && (
          <IconButton
            icon={maximize.on ? FoldHorizontal : UnfoldHorizontal}
            size={15}
            className="panel-control"
            label={maximize.on ? "元の幅に戻す" : "横幅いっぱいに広げる"}
            aria-pressed={maximize.on}
            onClick={maximize.toggle}
          />
        )}
        <strong className="side-view-title">{label?.tip ?? label?.label}</strong>
      </div>
      <div className="project-content side-project-view">
        <SideViewContent key={view} projectId={projectId} view={view} />
      </div>
    </div>
  );
}

function SideViewContent({ projectId, view }: { projectId: number; view: Exclude<SideView, "browser"> }) {
  switch (view) {
    case "files":
    case "search":
    case "changes":
    case "history":
    case "db":
      return <SideCodeView projectId={projectId} view={view} />;
    case "notes":
      return <SideNotes projectId={projectId} />;
    case "github":
      return <GitHubTab projectId={projectId} />;
    case "docker":
      return <DockerTab projectId={projectId} />;
    case "ci":
      return <CiTab projectId={projectId} />;
    case "trash":
      return <TrashTab projectId={projectId} />;
  }
}

/** ノート（真ん中のノートのタブとは別の右のタブの欄。ほかから開くよう頼まれたノートは 1 回だけ開く） */
function SideNotes({ projectId }: { projectId: number }) {
  const note = useSideOpenRequest(projectId, "note");
  return (
    <NoteTab projectId={projectId} scope={sideNoteScope(projectId)} openNote={note?.path} openNoteLine={note?.line} onOpenedNote={() => takeSideOpenRequest(projectId)} />
  );
}

/** 作業場所のコードの画面（ファイル・検索・変更・履歴）と DB（SQLite のファイルは、見ている作業場所の中を開く） */
function SideCodeView({ projectId, view }: { projectId: number; view: "files" | "search" | "changes" | "history" | "db" }) {
  const [worktree, setWorktree] = useSideWorktree(projectId);
  const project = useProjects().projectsById.get(projectId);
  const git = useGitStatus(projectId, view !== "db", worktree);
  // ほかから開くよう頼まれたファイル（別の作業場所のものなら、先にその作業場所へ切り替える）
  const openFile = useSideOpenRequest(projectId, "file")?.file;
  const followOpenFile = useEffectEvent(() => {
    if (!openFile) return;
    if (openFile.worktree !== worktree) return setWorktree(openFile.worktree);
    // EditorTab（子）が開いたあとに流れるので、ここで片付ける
    takeSideOpenRequest(projectId);
  });
  useEffect(() => {
    followOpenFile();
  }, [openFile, worktree]);
  if (!project) return <p className="muted small">読み込み中…</p>;
  if (view === "db") return <LazyDatabaseClient key={worktree ?? ""} projectId={projectId} place={`side-${projectId}`} worktree={worktree ?? null} />;
  return (
    <WorkplaceProvider value={{ projectId, worktree: worktree ?? null }}>
      {view === "history" ? (
        <HistoryTab key={worktree ?? ""} projectId={projectId} git={git} worktree={worktree} onWorktreeChange={setWorktree} />
      ) : (
        <EditorTab
          // 作業場所を変えたら初めからにする。開いたファイルのタブは作業場所ごとに覚える（戻れば元どおり）
          key={worktree ?? ""}
          view={view}
          projectId={projectId}
          repoPath={project.repo_path}
          git={git}
          worktree={worktree}
          onWorktreeChange={setWorktree}
          openFile={openFile?.worktree === worktree ? openFile : undefined}
          panelScope={`view-side-${projectId}-${worktree ?? "main"}`}
        />
      )}
    </WorkplaceProvider>
  );
}
