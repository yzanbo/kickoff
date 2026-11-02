import { useState } from "react";
import { useAppData } from "./appData";
import { OPEN_CONTENT_SEARCH_EVENT } from "./chatSearch";
import { AppFooter } from "./components/AppFooter";
import { BottomPanel } from "./components/bottomPanel/BottomPanel";
import { useBottomPanel } from "./components/bottomPanel/useBottomPanel";
import { CommandPalette } from "./components/CommandPalette";
import { LayoutToggles } from "./components/LayoutToggles";
import { ConnectionPopover } from "./components/ConnectionPopover";
import { SearchPanel } from "./components/SearchPanel";
import { UsagePopover } from "./components/UsagePopover";
import { NewProjectDialog } from "./components/newProject/NewProjectDialog";
import { ProjectChat } from "./components/projectChat/ProjectChat";
import { useProjectChat } from "./components/projectChat/useProjectChat";
import { SettingsDialog, type SettingsSection } from "./components/settings/SettingsDialog";
import { Sidebar, SidebarOpenButton } from "./components/sidebar/Sidebar";
import { loadCurrentProject } from "./components/sidebar/currentProject";
import { useSidebar } from "./components/sidebar/useSidebar";
import { terminalTargets } from "./components/sidePanel/useSidePanel";
import { DialogHost } from "./dialogs";
import { useWindowEvent } from "./hooks/useWindowEvent";
import { useRunNotifications } from "./notifications";
import { AllProjectsPage } from "./pages/AllProjectsPage";
import { ProjectPage } from "./pages/ProjectPage";
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
  // 設定のダイアログ（開いている項目。null なら閉じている）
  const [settings, setSettings] = useState<SettingsSection | null>(null);
  // 下のパネルのターミナル（プロジェクトごと。全プロジェクトの画面ではすべてのプロジェクトのものを出し、開くときにプロジェクトを選ぶ）
  // プロジェクトのチャット欄（画面の右端に、下のパネルより下まで。プロジェクトの画面でだけ出す）
  const chat = useProjectChat(routeProjectId(route));
  const bottomPanel = useBottomPanel(routeProjectId(route) ?? "all", terminalTargets(projects, routeProjectId(route)));

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
    openSettings: () => setSettings("usage"),
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
        {/* 画面と、その下のパネル（ターミナル） */}
        <div className={`main-column ${bottomPanel.open && bottomPanel.maximized ? "bottom-maximized" : ""}`}>
        <main className="main">
          {route.name === "project" || route.name === "run" || route.name === "newChat" ? (
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
            <AllProjectsPage projects={projects} approvals={approvals} onNewProject={() => setCreating(true)} />
          )}
        </main>
        <BottomPanel panel={bottomPanel} />
        </div>
        <ProjectChat chat={chat} projects={projects} />
        <AppFooter
          onOpenSettings={() => setSettings("usage")}
          connection={connection.state}
          connOpen={connOpen}
          onConnClick={() => setConnOpen((o) => !o)}
          usage={planUsage.usage}
          usageOpen={usageOpen}
          onUsageClick={() => setUsageOpen((o) => !o)}
          terminal={bottomPanel.available ? { open: bottomPanel.open, onClick: bottomPanel.toggle, elsewhere: bottomPanel.elsewhere } : undefined}
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
        {settings && <SettingsDialog initial={settings} onClose={() => setSettings(null)} />}
        {/* 開くボタンは、Electron のドラッグ領域より優先されるよう画面のいちばん後ろに置く */}
        <SidebarOpenButton sidebar={sidebar} />
        {/* 右上のレイアウトの開閉（ドラッグ領域より優先されるよう、開くボタンと同じく後ろに置く） */}
        <LayoutToggles
          sidebar={{ open: sidebar.open, onToggle: sidebar.toggle }}
          bottom={bottomPanel.available ? { open: bottomPanel.open, onToggle: bottomPanel.toggle } : undefined}
          chat={chat.projectId !== undefined ? { open: chat.open, onToggle: chat.toggle } : undefined}
        />
        <DialogHost />
        {connOpen && (
          <ConnectionPopover state={connection.state} since={connection.since} onClose={() => setConnOpen(false)} onOpenSettings={() => setSettings("connection")} />
        )}
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
