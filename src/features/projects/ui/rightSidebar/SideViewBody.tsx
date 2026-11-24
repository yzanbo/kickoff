import "./SideViewBody.css";
import { useEffect, useEffectEvent } from "react";
import { MaximizeButton, type PanelFrame } from "@/features/panel/ui";
import type { Project } from "@shared/projects/types";
import type { ProjectViewDef } from "@/features/projects/ui/projectViews";
import { ProjectViewHost } from "@/features/projects/ui/ProjectViewHost";
import { takeSideOpenRequest, useSideOpenRequest } from "./sideOpenRequests";
import { useSideWorktree } from "./useSideWorktree";
import { projectViewSurface, useLeaveGuard } from "@/features/projects/ui/viewLeave";

/**
 * 右サイドバーの中身 1 つ（プロジェクトのタブと同じ画面をそのまま描く。ProjectViewHost）。
 * 作業場所に付く画面（ファイル・検索・変更・履歴・DB）は、真ん中に開いているチャットの作業場所に付いていく（useSideWorktree）。開いたファイルのタブは作業場所ごとに覚える。
 * 真ん中のプロジェクトのタブとは別の状態にする（ノート・ファイルのタブの欄は、右サイドバーだけの範囲。画面の部品が place から決める）。
 * ほかから開くよう頼まれたファイル・ノート（sideOpenRequests）は 1 回だけ渡す
 */
export function SideViewContent({ project, def, frame }: { project: Project; def: ProjectViewDef; frame?: PanelFrame }) {
  const projectId = project.id;
  const [following, setWorktree] = useSideWorktree(projectId);
  // 作業場所を替える前に（中の切り替え・真ん中のチャットに付いていくとき）、中の書きかけ（DB の表の変更など）を聞く（やめたら元の作業場所のまま）
  const worktree = useLeaveGuard(following, () => projectViewSurface({ place: "rightSidebar", projectId, view: def.id }), setWorktree, "作業場所を切り替えます。");
  const note = useSideOpenRequest(projectId, "note");
  // ほかから開くよう頼まれたファイル（別の作業場所のものなら、先にその作業場所へ切り替える）
  const openFile = useSideOpenRequest(projectId, "file")?.file;
  const followOpenFile = useEffectEvent(() => {
    if (!openFile || !def.followsWorkplace) return;
    if (openFile.worktree !== worktree) return setWorktree(openFile.worktree);
    // 中身の部品（子）が開いたあとに流れるので、ここで片付ける
    takeSideOpenRequest(projectId);
  });
  useEffect(() => {
    followOpenFile();
  }, [openFile, worktree]);
  return (
    <ProjectViewHost
      def={def}
      ctx={{
        project,
        place: "rightSidebar",
        worktree: worktree ?? null,
        setWorktree: (path) => setWorktree(path ?? undefined),
        stale: false,
        openFile,
        openNote: note?.path,
        openNoteLine: note?.line,
        takeRequest: () => takeSideOpenRequest(projectId),
        frame,
      }}
    />
  );
}

/** 見ているときだけ描く中身の枠（見出しの行の名前と、横幅いっぱいの切り替え）。見ていない中身は描かない（裏で取り直し・見張りを続けない。開いていたもの・絞り込みは設定と欄の店に残る） */
export function SideViewBody({ project, def, frame }: { project: Project; def: ProjectViewDef; frame?: PanelFrame }) {
  const maximize = frame?.maximize;
  return (
    <div className="side-view">
      <div className="side-view-head bar">
        {maximize && <MaximizeButton state={maximize} />}
        <strong className="side-view-title">{def.tip ?? def.label}</strong>
      </div>
      <div className="project-content side-project-view">
        <SideViewContent key={def.id} project={project} def={def} frame={frame} />
      </div>
    </div>
  );
}
