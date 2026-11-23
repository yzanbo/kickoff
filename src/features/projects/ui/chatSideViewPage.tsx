// チャットの右の欄のプロジェクトの画面のタブ（chatSideView.ts の種類）の、名前の前のアイコンと中身
import { useState } from "react";
import type { PanelTab, TabPageProps } from "@/features/panel/ui";
import { projectViewOf } from "./projectViews";
import { ProjectViewHost } from "./ProjectViewHost";
import { useProjects } from "./stores/projects";
import { projectViewSurface, useLeaveGuard } from "./viewLeave";

type ProjectViewTab = Extract<PanelTab, { kind: "projectView" }>;

/** 名前の前のアイコン（プロジェクトの左の列のタブと同じ） */
export function ChatSideViewLead({ tab }: { tab: ProjectViewTab }) {
  const Icon = projectViewOf(tab.view)?.icon;
  return Icon ? <Icon size={12} aria-hidden /> : null;
}

/**
 * プロジェクトの画面と同じ部品をそのまま描く。見る作業場所はチャットの作業場所から始め、中の切り替えで変えられる（このタブの中だけ。プロジェクトのタブの作業場所は変えない）。
 * 開いたファイルのタブ・DB の開いているタブは、プロジェクトのタブとは別にチャットごとに覚える（画面の部品が chatId から決める）
 */
export function ChatSideViewPage({ tab }: TabPageProps<ProjectViewTab>) {
  const [wanted, setWorktree] = useState(tab.worktree ?? null);
  // 作業場所を替える前に、中の書きかけ（DB の表の変更など）を聞く（やめたら元の作業場所のまま）
  const worktree = useLeaveGuard(wanted, () => projectViewSurface({ place: "chatSide", projectId: tab.projectId, chatId: tab.chatId, view: tab.view }), setWorktree, "作業場所を切り替えます。");
  const project = useProjects().projectsById.get(tab.projectId);
  const def = projectViewOf(tab.view);
  if (!def) return null;
  if (!project) return <p className="muted small">読み込み中…</p>;
  const host = <ProjectViewHost def={def} ctx={{ project, place: "chatSide", chatId: tab.chatId, worktree, setWorktree, stale: false }} />;
  return def.chatSide?.bare ? host : <div className="project-content side-project-view">{host}</div>;
}
