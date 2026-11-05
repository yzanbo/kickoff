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
import { OPEN_NEW_PROJECT_EVENT, OPEN_NO_PROJECTS_GUIDE_EVENT, type NewProjectRequest } from "@/features/project/new/openNewProject";
import { NoProjectsGuide } from "@/features/project/NoProjectsGuide";
import { ProjectChat } from "@/features/panel/projectChat/ProjectChat";
import { useProjectChat } from "@/features/panel/projectChat/useProjectChat";
import { SettingsDialog, type SettingsSection } from "@/features/settings/SettingsDialog";
import { DiagnosticsIndicator } from "@/features/diagnostics/DiagnosticsIndicator";
import { HoverTip } from "@/ui/HoverTip";
import { MemoProgress } from "@/features/memo/MemoProgress";
import { OPEN_SETTINGS_EVENT } from "@/features/settings/openSettings";
import { Sidebar, SidebarOpenButton } from "@/features/sidebar/Sidebar";
import { useFallbackProject } from "@/features/sidebar/currentProject";
import { useSidebar } from "@/features/sidebar/useSidebar";
import { terminalTargets } from "@/features/panel/usePanel";
import { DialogHost } from "@/ui/dialogs";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { useChatNotifications } from "./notifications";
import { AllProjectsPage } from "@/features/board/AllProjectsPage";
import { ProjectPage } from "@/features/project/page/ProjectPage";
import { boardTabOf, openMemo, openNewChat, openProjectFile, RouteContext, routeProjectId, useHashRoute } from "./router";
import { subscribeWindowMessages } from "./windowBus";
import { useBoardColumns } from "@/features/board/BoardColumnsToggle";
import { useChatPlacement } from "@/features/project/page/chatPlacement";
import { useChatHistory } from "./useChatHistory";
import { useAppShortcuts } from "./shortcuts";
import { PlanUsageContext, usePlanUsage } from "@/features/usage/usage";
import { setProjectHues } from "@/features/project/projectColor";
import { forgetDraftsOfMissingProjects } from "@/features/panel/state/panelDrafts";
import { useApplyChatFontSize } from "@/features/chat/pane/chatFontSize";
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
  const { projects, projectName, missing: missingProject, loaded: projectsLoaded } = useProjects();
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
  // プロジェクトがないのに新しいチャットを始めようとしたときの案内（チャットはプロジェクトの中で始めることを説明して、作るよう誘う）
  const [noProjectsGuide, setNoProjectsGuide] = useState(false);
  const [palette, setPalette] = useState(false);
  // ⌘⇧A: 作業中・回答待ち・未読のチャットの一覧
  const [activeChats, setActiveChats] = useState(false);
  const [searching, setSearching] = useState(false);
  // 設定のダイアログ（開いている項目。null なら閉じている）
  const [settings, setSettings] = useState<SettingsSection | null>(null);
  // URL のプロジェクト。もうないとわかったもの（消した・URL の番号が違う）は、ないものとする
  // （チャット欄・下のパネル・下の帯に出さず、そのプロジェクトのワークツリー・グループなどを読みに行かない）
  const routeProject = routeProjectId(route);
  const projectId = missingProject(routeProject) ? undefined : routeProject;
  // URL にプロジェクトがない画面（全プロジェクト）で使うプロジェクト: サイドバーで最後に選んでいたもの（もうなければ先頭）。
  // ⌘N の新しいチャットの作成先と、チャット欄の持ち主（全プロジェクトのボードの「新規」も同じ）
  const fallbackProject = useFallbackProject();
  // 下のパネルのターミナル（プロジェクトごと。全プロジェクトの画面ではすべてのプロジェクトのものを出し、開くときにプロジェクトを選ぶ）
  // プロジェクトのチャット欄（画面の右端に、下のパネルより下まで。全プロジェクトの画面では、サイドバーで選んでいるプロジェクトのもの）
  const chat = useProjectChat(projectId ?? fallbackProject);
  const bottomPanel = useBottomPanel(projectId ?? "all", terminalTargets(projects, projectId));
  // チャット・新しいチャットの URL では、最後に見たボード（カンバン / グループのボード）のパネルで開く
  const [boardColumns] = useBoardColumns();
  // チャットを開く場所（ボードと分けた「チャット」タブ / ボードの右のパネル）
  const [chatPlacement] = useChatPlacement();

  /** 新しいチャット: 開いている（なければサイドバーで選んでいる）プロジェクトで始める（もうないプロジェクトは飛ばす） */
  const startNewChat = () => {
    const target = projectId ?? fallbackProject;
    if (target) openNewChat(target);
    // いきなり新しいプロジェクトのダイアログを開かず、チャットはプロジェクトの中で始めることを説明してから作るよう誘う
    else setNoProjectsGuide(true);
  };

  // 会話の文字の大きさ（<html> の CSS 変数）
  useApplyChatFontSize();
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
  useWindowEvent(OPEN_NO_PROJECTS_GUIDE_EVENT, () => setNoProjectsGuide(true));
  useWindowEvent(OPEN_SETTINGS_EVENT, (e) => setSettings((e as CustomEvent<SettingsSection>).detail));
  // 別ウィンドウの「エディタタブで開く」は、このウィンドウのエディタタブで開く
  useEffect(
    () =>
      subscribeWindowMessages((m) => {
        if (m.type === "openProjectFile") openProjectFile(m.projectId, m.file);
        else if (m.type === "openMemo") openMemo(m.projectId, m.path);
      }),
    [],
  );

  return (
    <PlanUsageContext.Provider value={planUsage}>
      <RouteContext.Provider value={route}>
      <ChatStatesContext.Provider value={chatStates}>
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
            // チャット・新しいチャットはプロジェクトのボードの右側のパネルで開く（同じ要素のままなので、開いているタブは残る）
            <ProjectPage
              id={route.name === "project" ? route.id : route.projectId}
              // 最後に見たボードで開く（サイドバーのグループの＋から来たときは、グループのボードで始める）
              tab={route.name === "project" ? route.tab : boardTabOf(route, boardColumns, chatPlacement)}
              focus={route.name === "project" ? undefined : route}
              highlightGroup={route.name === "project" ? route.group : undefined}
              openFile={route.name === "project" ? route.file : undefined}
              openMemo={route.name === "project" ? route.memo : undefined}
            />
          ) : (
            <AllProjectsPage />
          )}
        </main>
        <BottomPanel bottom={bottomPanel} />
        </div>
        <ProjectChat chat={chat} />
        <AppFooter onOpenSettings={setSettings} connection={connection} planUsage={planUsage} projectId={projectId} />
        {creating && (
          <NewProjectDialog
            defaultParentDir={appSettings?.projects_dir ?? "~/Documents"}
            initialName={creating.name}
            initialMode={creating.mode}
            onClose={() => setCreating(null)}
            onCreated={(project) => {
              setCreating(null);
              addProject(project);
              if (creating.onCreated) creating.onCreated(project);
              else openNewChat(project.id);
            }}
          />
        )}
        {noProjectsGuide && <NoProjectsGuide onClose={() => setNoProjectsGuide(false)} />}
        {settings && <SettingsDialog key={settings} initial={settings} onClose={() => setSettings(null)} />}
        {/* 性能の記録の様子（メニューの「ヘルプ」・設定の「診断」から始まる） */}
        <DiagnosticsIndicator />
        {/* マウスを乗せたときの説明（data-tip を付けた要素。アプリ全体で 1 つ） */}
        <HoverTip />
        <MemoProgress />
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
            projectId={projectId}
            onClose={() => setSearching(false)}
          />
        )}
      </div>
      </ChatStatesContext.Provider>
      </RouteContext.Provider>
    </PlanUsageContext.Provider>
  );
}
