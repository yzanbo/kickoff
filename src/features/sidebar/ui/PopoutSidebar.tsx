import { useEffect } from "react";
import { followMain } from "@/foundation/ui/navigation/popout";
import { RouteContext, routeProjectId } from "@/foundation/ui/navigation/router";
import { postWindowMessage } from "@/foundation/ui/navigation/windowBus";
import { Sidebar } from "./Sidebar";
import { useMainWindowRoute } from "@/foundation/ui/navigation/useMainWindowRoute";
import { openAppDialog } from "@/foundation/ui/shell/points";
import { useProjects, openNewProject, useFallbackProject } from "@/features/projects/ui";

/**
 * サイドバーの別ウィンドウの中身（メインのウィンドウと同じ Sidebar を、ウィンドウいっぱいに）。
 * いまの画面（開いているチャット・プロジェクトの強調）と下書きの行・子チャットの行に要るパネルの値はメインのウィンドウから写しを受け取り、
 * 行を押す・新しいチャット・検索などはメインのウィンドウで開く（行は @/foundation/ui/navigation/popoutNavigation.ts、ほかは openAppDialog）
 */
export function PopoutSidebar() {
  // 開いている間、下書き・子チャットの行に要るパネルの値の写しを受け取る（種類の follow。メインのウィンドウは sidebarWindow を見て送る）
  useEffect(() => followMain("sidebar"), []);
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
