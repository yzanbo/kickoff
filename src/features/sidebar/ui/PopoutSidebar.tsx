import { useEffect } from "react";
import { dispatchAppEvent, OPEN_COMMAND_PALETTE_EVENT, START_NEW_CHAT_EVENT } from "@/foundation/ui/navigation/popoutNavigation";
import { RouteContext, routeProjectId } from "@/foundation/ui/navigation/router";
import { postWindowMessage } from "@/foundation/ui/navigation/windowBus";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { followMainPanels } from "@/features/panel/ui/state/panelMirror";
import { openNewProject } from "@/features/projects/ui/new/openNewProject";
import { Sidebar } from "./Sidebar";
import { useFallbackProject } from "@/features/projects/ui/currentProject";
import { useMainWindowRoute } from "@/foundation/ui/navigation/useMainWindowRoute";

/**
 * サイドバーの別ウィンドウの中身（メインのウィンドウと同じ Sidebar を、ウィンドウいっぱいに）。
 * いまの画面（開いているチャット・プロジェクトの強調）とパネルの状態（下書きの行など）はメインのウィンドウから写しを受け取り、
 * 行を押す・新しいチャット・検索などはメインのウィンドウで開く（app/popoutNavigation.ts）
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
        onNewChat={() => dispatchAppEvent(START_NEW_CHAT_EVENT)}
        onSearch={() => dispatchAppEvent(OPEN_COMMAND_PALETTE_EVENT)}
        onNewProject={() => openNewProject()}
      />
    </RouteContext.Provider>
  );
}
