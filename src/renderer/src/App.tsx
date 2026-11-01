import { useState } from "react";
import { useAppData } from "./appData";
import { AppFooter } from "./components/AppFooter";
import { CommandPalette } from "./components/CommandPalette";
import { ConnectionPopover } from "./components/ConnectionPopover";
import { NewProjectDialog } from "./components/NewProjectDialog";
import { SearchPanel } from "./components/SearchPanel";
import { loadCurrentProject } from "./components/sidebar/currentProject";
import { Sidebar, SidebarOpenButton } from "./components/sidebar/Sidebar";
import { useSidebar } from "./components/sidebar/useSidebar";
import { UsagePopover } from "./components/UsagePopover";
import { OPEN_CONTENT_SEARCH_EVENT } from "./chatSearch";
import { DialogHost } from "./dialogs";
import { useWindowEvent } from "./hooks/useWindowEvent";
import { useRunNotifications } from "./notifications";
import { HomePage } from "./pages/HomePage";
import { ProjectPage } from "./pages/ProjectPage";
import { SettingsPage } from "./pages/SettingsPage";
import { openNewChat, routeProjectId, useRoute } from "./router";
import { useAppShortcuts } from "./shortcuts";
import { applyTheme, loadTheme } from "./theme";
import { PlanUsageContext, usePlanUsage } from "./usage";

applyTheme(loadTheme());

export function App() {
  const route = useRoute();
  const planUsage = usePlanUsage();
  const { projects, approvals, projectsDir, notifyEnabled, loadProjects, connection } = useAppData(planUsage.onEvent);
  // チャットの完了・失敗・回答待ちを Mac の通知で知らせる（設定で切り替え）
  useRunNotifications({ enabled: notifyEnabled, projects, route });
  const sidebar = useSidebar();
  const [creating, setCreating] = useState(false);
  const [palette, setPalette] = useState(false);
  const [searching, setSearching] = useState(false);
  // 下の帯の接続・使用状況の詳細（その場に出すだけで、画面は移らない）
  const [connOpen, setConnOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);

  /** 新しいチャット: 開いている（なければサイドバーで選んでいる）プロジェクトで始める */
  const startNewChat = () => {
    const projectId = routeProjectId(route) ?? loadCurrentProject() ?? projects[0]?.id;
    if (projectId) openNewChat(projectId);
    else setCreating(true);
  };

  useAppShortcuts({
    toggleSidebar: sidebar.toggle,
    openPalette: () => setPalette(true),
    openContentSearch: () => setSearching(true),
    newChat: startNewChat,
  });
  // ボードの検索欄の横のボタンから、チャットの中の文言の全文検索を開く
  useWindowEvent(OPEN_CONTENT_SEARCH_EVENT, () => setSearching(true));

  return (
    <PlanUsageContext.Provider value={planUsage}>
      <div {...sidebar.layout}>
        <Sidebar
          sidebar={sidebar}
          route={route}
          projects={projects}
          approvals={approvals}
          onNewChat={startNewChat}
          onSearch={() => setPalette(true)}
          onNewProject={() => setCreating(true)}
        />
        <main className="main">
          {route.name === "settings" ? (
            <SettingsPage planUsage={planUsage} />
          ) : route.name === "project" || route.name === "run" || route.name === "newChat" ? (
            // チャット・新しいチャットはプロジェクトのカンバンの右側のパネルで開く（同じ要素のままなので、開いているタブは残る）
            <ProjectPage
              id={route.name === "project" ? route.id : route.projectId}
              // サイドバーのグループの＋から来たときは、グループのタブで始める
              tab={route.name === "project" ? route.tab : route.name === "newChat" && route.group ? "groups" : "board"}
              projects={projects}
              focus={route.name === "project" ? undefined : route}
              highlightGroup={route.name === "project" ? route.group : undefined}
            />
          ) : (
            <HomePage projects={projects} approvals={approvals} onNewProject={() => setCreating(true)} />
          )}
        </main>
        <AppFooter
          connection={connection.state}
          connOpen={connOpen}
          onConnClick={() => setConnOpen((o) => !o)}
          usage={planUsage.usage}
          usageOpen={usageOpen}
          onUsageClick={() => setUsageOpen((o) => !o)}
        />
        {creating && (
          <NewProjectDialog
            defaultParentDir={projectsDir}
            onClose={() => setCreating(false)}
            onCreated={(project) => {
              setCreating(false);
              loadProjects();
              openNewChat(project.id, { section: "requirements" });
            }}
          />
        )}
        {/* 開くボタンは、Electron のドラッグ領域より優先されるよう画面のいちばん後ろに置く */}
        <SidebarOpenButton sidebar={sidebar} />
        <DialogHost />
        {connOpen && <ConnectionPopover state={connection.state} since={connection.since} onClose={() => setConnOpen(false)} />}
        {usageOpen && <UsagePopover planUsage={planUsage} onClose={() => setUsageOpen(false)} />}
        {palette && <CommandPalette projects={projects} onClose={() => setPalette(false)} />}
        {searching && (
          <SearchPanel
            runId={route.name === "run" ? route.runId : undefined}
            projectId={routeProjectId(route)}
            onClose={() => setSearching(false)}
          />
        )}
      </div>
    </PlanUsageContext.Provider>
  );
}
