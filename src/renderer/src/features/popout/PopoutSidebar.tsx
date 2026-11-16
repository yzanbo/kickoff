import { useEffect, useMemo, useState } from "react";
import { dispatchAppEvent, OPEN_COMMAND_PALETTE_EVENT, START_NEW_CHAT_EVENT } from "@/app/popoutNavigation";
import { parse, RouteContext, routeProjectId, type Route } from "@/app/router";
import { postWindowMessage, subscribeWindowMessages } from "@/app/windowBus";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { useProjects } from "@/stores/projects";
import { followMainPanels } from "@/features/panel/state/panelMirror";
import { openNewProject } from "@/features/project/new/openNewProject";
import { Sidebar } from "@/features/sidebar/Sidebar";
import { useFallbackProject } from "@/features/sidebar/currentProject";

/**
 * サイドバーの別ウィンドウの中身（メインのウィンドウと同じ Sidebar を、ウィンドウいっぱいに）。
 * いまの画面（開いているチャット・プロジェクトの強調）とパネルの状態（下書きの行など）はメインのウィンドウから写しを受け取り、
 * 行を押す・新しいチャット・検索などはメインのウィンドウで開く（app/popoutNavigation.ts）
 */
export function PopoutSidebar() {
  const route = useMainWindowRoute();
  const { missing } = useProjects();
  const fallbackProject = useFallbackProject();
  const routeProject = routeProjectId(route);
  // ⌘N と同じ作成先（メインのウィンドウで開いているプロジェクト、なければサイドバーで選んでいるもの）
  const newChatProject = routeProject !== undefined && !missing(routeProject) ? routeProject : fallbackProject;
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

/**
 * メインのウィンドウのいまの画面（届くまでは全プロジェクト）。開いている間、メインのウィンドウに開いていると知らせ、
 * 画面とパネルの状態の写しを受け取る（app/sidebarWindowHost.ts）
 */
function useMainWindowRoute(): Route {
  const [hash, setHash] = useState("#/");
  useEffect(() => {
    const offPanels = followMainPanels();
    const off = subscribeWindowMessages((m) => {
      if (m.type === "mainRoute") setHash(m.hash);
      // メインのウィンドウが読み込み直したら、開いていると知らせ直す
      else if (m.type === "mainWindowReady") postWindowMessage({ type: "sidebarWindow", open: true });
    });
    postWindowMessage({ type: "sidebarWindow", open: true });
    return () => {
      off();
      offPanels();
      postWindowMessage({ type: "sidebarWindow", open: false });
    };
  }, []);
  // ウィンドウを閉じた・読み込み直した（effect の片付けは流れない）
  useWindowEvent("pagehide", () => postWindowMessage({ type: "sidebarWindow", open: false }));
  return useMemo(() => parse(hash), [hash]);
}
