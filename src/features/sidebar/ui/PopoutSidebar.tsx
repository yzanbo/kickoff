import { useEffect } from "react";
import { RouteContext, routeProjectId } from "@/foundation/ui/navigation/router";
import { postWindowMessage } from "@/foundation/ui/navigation/windowBus";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { followMainPanels } from "@/features/panel/ui/state/panelMirror";
import { openNewProject } from "@/features/projects/ui/new/openNewProject";
import { Sidebar } from "./Sidebar";
import { useFallbackProject } from "@/features/projects/ui/currentProject";
import { useMainWindowRoute } from "@/foundation/ui/navigation/useMainWindowRoute";
import { openAppDialog } from "@/foundation/ui/shell/points";

/**
 * サイドバーの別ウィンドウの中身（メインのウィンドウと同じ Sidebar を、ウィンドウいっぱいに）。
 * いまの画面（開いているチャット・プロジェクトの強調）とパネルの状態（下書きの行など）はメインのウィンドウから写しを受け取り、
 * 行を押す・新しいチャット・検索などはメインのウィンドウで開く（行は @/foundation/ui/navigation/popoutNavigation.ts、ほかは openAppDialog）
 */
export function PopoutSidebar() {
  // 開いている間、パネルの状態の写しを受け取る（メインのウィンドウは sidebarWindow を見て送る）
  useEffect(() => followMainPanels(), []);
  const route = useMainWindowRoute((open) => postWindowMessage("sidebarWindow", { open }));
  const { missing } = useProjects();
  const fallbackProject = useFallbackProject();
  const routeProject = routeProjectId(route);
  // ⌘N と同じ作成先（メインのウィンドウで開いているプロジェクト、なければサイドバーで選んでいるもの）
  const newChatProject = routeProject !== null && !missing(routeProject) ? routeProject : fallbackProject;
  return (
    <RouteContext.Provider value={route}>
      <Sidebar
        newChatProject={newChatProject}
        onNewChat={() => openAppDialog("newChat")}
        onSearch={() => openAppDialog("commandPalette")}
        onNewProject={() => openNewProject()}
      />
    </RouteContext.Provider>
  );
}

/** 別ウィンドウのサイドバー（PopoutApp が描く中身） */
export function SidebarPopoutPage() {
  return (
    <div className="popout-body">
      <PopoutSidebar />
    </div>
  );
}
