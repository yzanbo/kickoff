import { useEffect, useMemo, useState } from "react";
import { publishServerEvent } from "@/api/events";
import { useServerConnection } from "@/api/useServerConnection";
import { useApprovals } from "@/stores/approvals";
import { addProject, useProjects } from "@/stores/projects";
import { useAppSettings } from "@/stores/settings";
import { OPEN_CONTENT_SEARCH_EVENT } from "@/features/chat/chatSearch";
import { AppFooter } from "@/features/footer/AppFooter";
import { BottomPanel } from "@/features/panel/bottom/BottomPanel";
import { useBottomPanel } from "@/features/panel/bottom/useBottomPanel";
import { ActiveChatsPalette } from "@/features/palette/ActiveChatsPalette";
import { CommandPalette } from "@/features/palette/CommandPalette";
import { LayoutToggles } from "./LayoutToggles";
import { SearchPanel } from "@/features/palette/SearchPanel";
import { NewProjectDialog } from "@/features/project/new/NewProjectDialog";
import { OPEN_NEW_PROJECT_EVENT, type NewProjectRequest } from "@/features/project/new/openNewProject";
import { ProjectChat } from "@/features/panel/projectChat/ProjectChat";
import { ProjectChatContext, useProjectChat } from "@/features/panel/projectChat/useProjectChat";
import { SettingsDialog, type SettingsSection } from "@/features/settings/SettingsDialog";
import { DiagnosticsIndicator } from "@/features/diagnostics/DiagnosticsIndicator";
import { HoverTip } from "@/ui/HoverTip";
import { OPEN_SETTINGS_EVENT } from "@/features/settings/openSettings";
import { Sidebar, SidebarOpenButton } from "@/features/sidebar/Sidebar";
import { loadCurrentProject } from "@/features/sidebar/currentProject";
import { useSidebar } from "@/features/sidebar/useSidebar";
import { terminalTargets } from "@/features/panel/usePanel";
import { DialogHost } from "@/ui/dialogs";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { useChatNotifications } from "./notifications";
import { AllProjectsPage } from "@/features/board/AllProjectsPage";
import { ProjectPage } from "@/features/project/page/ProjectPage";
import { openNewChat, RouteContext, routeProjectId, useHashRoute } from "./router";
import { useChatHistory } from "./useChatHistory";
import { useAppShortcuts } from "./shortcuts";
import { PlanUsageContext, usePlanUsage } from "@/features/usage/usage";
import { setProjectHues } from "@/features/project/projectColor";
import { forgetDraftsOfMissingProjects } from "@/features/panel/state/panelMemory";
import { ChatStatesContext, indexApprovals } from "./chatStatesContext";

export function App() {
  // URL（ハッシュ）はここで 1 回だけ購読し、部品は useRoute()（RouteContext）で読む
  const route = useHashRoute();
  // ⌘[ / ⌘] で、前に開いたチャット・次のチャットへ
  useChatHistory(route);
  const planUsage = usePlanUsage();
  // サーバーとつなぎ、届いた知らせを各画面と店（stores/）に配る（ここで 1 回だけ）
  const connection = useServerConnection(publishServerEvent);
  // アプリ全体で使うデータ（プロジェクト・回答待ち・設定）は店から読む（要る部品も、props で中継せずに店から読む）
  const { projects, projectName, loaded: projectsLoaded } = useProjects();
  const approvals = useApprovals();
  const appSettings = useAppSettings().data;
  // プロジェクトの色（DB に覚えた色）を、色を使う部品が読めるようにする（描く前に入れる）
  setProjectHues(projects);
  // 消したプロジェクトの下書き（再起動しても残すもの）を片付ける（一覧が届いてから）
  useEffect(() => {
    if (projectsLoaded) forgetDraftsOfMissingProjects(new Set(projects.map((p) => p.id)));
  }, [projects, projectsLoaded]);
  // 回答待ちの依頼からチャットの状態を引く（approvals を中継せず、要る部品が useChatStates で読む）
  const chatStates = useMemo(() => indexApprovals(approvals), [approvals]);
  // チャットの完了・失敗・回答待ちを Mac の通知で知らせる（設定で切り替え。設定が届くまでは知らせる）
  useChatNotifications({ enabled: appSettings?.desktop_notifications ?? true, projectName, route });
  const sidebar = useSidebar();
  // 新しいプロジェクトのダイアログ（null = 閉じている。名前の初めの値・作ったあとの処理を持てる）
  const [creating, setCreating] = useState<NewProjectRequest | null>(null);
  const [palette, setPalette] = useState(false);
  // ⌘⇧A: 作業中・回答待ち・未読のチャットの一覧
  const [activeChats, setActiveChats] = useState(false);
  const [searching, setSearching] = useState(false);
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
    else setCreating({});
  };

  useAppShortcuts({
    toggleSidebar: sidebar.toggle,
    openPalette: () => setPalette(true),
    openContentSearch: () => setSearching(true),
    newChat: startNewChat,
    openSettings: () => setSettings("usage"),
    openActiveChats: () => setActiveChats(true),
  });
  // ボードの検索欄の横のボタンから、チャットの中の文言の全文検索を開く
  useWindowEvent(OPEN_CONTENT_SEARCH_EVENT, () => setSearching(true));
  // 部品から設定をその項目で開く（チャット欄のマイクから「音声入力」など。開いていれば、その項目に切り替える）
  useWindowEvent(OPEN_NEW_PROJECT_EVENT, (e) => setCreating((e as CustomEvent<NewProjectRequest>).detail));
  useWindowEvent(OPEN_SETTINGS_EVENT, (e) => setSettings((e as CustomEvent<SettingsSection>).detail));

  return (
    <PlanUsageContext.Provider value={planUsage}>
      <RouteContext.Provider value={route}>
      <ChatStatesContext.Provider value={chatStates}>
      <ProjectChatContext.Provider value={chat}>
      <div {...sidebar.layout}>
        <Sidebar
          sidebar={sidebar}
          onNewChat={startNewChat}
          onSearch={() => setPalette(true)}
          onNewProject={() => setCreating({})}
        />
        {/* 画面と、その下のパネル（ターミナル） */}
        <div className={`main-column ${bottomPanel.open && bottomPanel.maximized ? "bottom-maximized" : ""}`}>
        <main className="main">
          {route.name === "project" || route.name === "chat" || route.name === "newChat" ? (
            // チャット・新しいチャットはプロジェクトのカンバンの右側のパネルで開く（同じ要素のままなので、開いているタブは残る）
            <ProjectPage
              id={route.name === "project" ? route.id : route.projectId}
              // サイドバーのグループの＋から来たときは、グループのタブで始める
              tab={route.name === "project" ? route.tab : route.name === "newChat" && route.group ? "groups" : "board"}
              focus={route.name === "project" ? undefined : route}
              highlightGroup={route.name === "project" ? route.group : undefined}
              openFile={route.name === "project" ? route.file : undefined}
            />
          ) : (
            <AllProjectsPage onNewProject={() => setCreating({})} />
          )}
        </main>
        <BottomPanel bottom={bottomPanel} />
        </div>
        <ProjectChat chat={chat} />
        <AppFooter onOpenSettings={setSettings} connection={connection} planUsage={planUsage} projectId={routeProjectId(route)} />
        {creating && (
          <NewProjectDialog
            defaultParentDir={appSettings?.projects_dir ?? "~/Documents"}
            initialName={creating.name}
            onClose={() => setCreating(null)}
            onCreated={(project) => {
              setCreating(null);
              addProject(project);
              if (creating.onCreated) creating.onCreated(project);
              else openNewChat(project.id);
            }}
          />
        )}
        {settings && <SettingsDialog key={settings} initial={settings} onClose={() => setSettings(null)} />}
        {/* 性能の記録の様子（メニューの「ヘルプ」・設定の「診断」から始まる） */}
        <DiagnosticsIndicator />
        {/* マウスを乗せたときの説明（data-tip を付けた要素。アプリ全体で 1 つ） */}
        <HoverTip />
        {/* 開くボタンは、Electron のドラッグ領域より優先されるよう画面のいちばん後ろに置く */}
        <SidebarOpenButton sidebar={sidebar} />
        {/* 右上のレイアウトの開閉（ドラッグ領域より優先されるよう、開くボタンと同じく後ろに置く） */}
        <LayoutToggles
          sidebar={{ open: sidebar.open, onToggle: sidebar.toggle }}
          bottom={bottomPanel.available ? { open: bottomPanel.open, onToggle: bottomPanel.toggle } : undefined}
          chat={chat.projectId !== undefined ? { open: chat.open, onToggle: chat.toggle } : undefined}
        />
        <DialogHost />
        {palette && <CommandPalette onClose={() => setPalette(false)} />}
        {activeChats && <ActiveChatsPalette onClose={() => setActiveChats(false)} />}
        {searching && (
          <SearchPanel
            chatId={route.name === "chat" ? route.chatId : undefined}
            projectId={routeProjectId(route)}
            onClose={() => setSearching(false)}
          />
        )}
      </div>
      </ProjectChatContext.Provider>
      </ChatStatesContext.Provider>
      </RouteContext.Provider>
    </PlanUsageContext.Provider>
  );
}
