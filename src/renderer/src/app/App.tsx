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
import { OPEN_ACTIVE_CHATS_EVENT, type ActiveChatsRequest } from "@/features/palette/openActiveChats";
import { CommandPalette } from "@/features/palette/CommandPalette";
import { LayoutToggles } from "./LayoutToggles";
import { useProjectHeaderMode } from "@/features/project/page/headerMode";
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
import { ToastHost } from "@/ui/toast";
import { GitHubDialogHost } from "@/features/github/GitHubDialogHost";
import { QueueResumeHost } from "@/features/chat/queue/QueueResumeDialog";
import { PrNoticeHost } from "@/features/worktree/prNotice/PrNoticeDialog";
import { OPEN_SETTINGS_EVENT } from "@/features/settings/openSettings";
import { Sidebar, SidebarOpenButton } from "@/features/sidebar/Sidebar";
import { useFallbackProject } from "@/features/sidebar/currentProject";
import { requestCodeSearchFocus } from "@/features/editor/codeSearchFocus";
import { useSidebar } from "@/features/sidebar/useSidebar";
import { terminalTargets } from "@/features/panel/usePanel";
import { DialogHost } from "@/ui/dialogs";
import { DbUnlockHost } from "@/features/database/DbUnlockHost";
import { DropHintHost } from "@/ui/DropHint";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { useChatNotifications } from "./notifications";
import { useCiFailureNotifications } from "./ciNotifications";
import { useDockBadge } from "./dockBadge";
import { useAgentBrowserBridge } from "./agentBrowser";
import { AllProjectsPage } from "@/features/board/AllProjectsPage";
import { ProjectPage } from "@/features/project/page/ProjectPage";
import { boardTabOf, openNewChat, openProjectSearch, RouteContext, routeProjectId, useHashRoute } from "./router";
import { handleMainWindowMessage } from "./mainWindowMessages";
import { subscribeWindowMessages } from "./windowBus";
import { useChatPlacement } from "@/features/project/page/chatPlacement";
import { useChatHistory } from "./useChatHistory";
import { useAppShortcuts } from "./shortcuts";
import { usePlanUsage } from "@/features/usage/usage";
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
  // 作業場所のブランチ・既定のブランチで CI が落ちたら Mac の通知で知らせる（同じ設定。プロジェクトごとの切り替えは設定の「GitHub」）
  useCiFailureNotifications({ enabled: appSettings?.desktop_notifications ?? true, projectName, route });
  // 要対応（回答待ち・未読）の数を Dock のアイコンの赤い数字で出す（設定で切り替え。設定が届くまでは出す）
  useDockBadge({ enabled: appSettings?.dock_badge ?? true, projects, pending: chatStates.pending });
  // AI が埋め込みブラウザのタブを開く・操作している印
  useAgentBrowserBridge();
  const sidebar = useSidebar();
  // 新しいプロジェクトのダイアログ（null = 閉じている。名前の初めの値・作ったあとの処理を持てる）
  const [creating, setCreating] = useState<NewProjectRequest | null>(null);
  // プロジェクトがないのに新しいチャットを始めようとしたときの案内（チャットはプロジェクトの中で始めることを説明して、作るよう誘う）
  const [noProjectsGuide, setNoProjectsGuide] = useState(false);
  const [palette, setPalette] = useState(false);
  // ⌘⇧A: 作業中・回答待ち・未読のチャットの一覧（null = 閉じている。プロジェクトのボタンから開いたときは、そのプロジェクトで絞り込む）
  const [activeChats, setActiveChats] = useState<ActiveChatsRequest | null>(null);
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
  // 全プロジェクトの画面ではチャットを出さない（ターミナルとブラウザだけ。チャットはそのプロジェクトへ移って開く）
  const chat = useProjectChat(projectId ?? fallbackProject, { noChat: projectId === undefined });
  const bottomPanel = useBottomPanel(projectId ?? "all", terminalTargets(projects, projectId));
  // チャット・新しいチャットの URL では、プロジェクトのボードのパネルで開く
  // チャットを開く場所（ボードと分けた「チャット」タブ / ボードの右のパネル）
  const [chatPlacement] = useChatPlacement();
  // プロジェクトの画面（チャット・新しいチャットもその中に出す）では、右上のレイアウトの開閉を見出しの行の出し方に合わせる
  const [projectHeaderMode] = useProjectHeaderMode();
  const showsProjectPage = route.name === "project" || route.name === "chat" || route.name === "newChat";

  /** 新しいチャット: 開いている（なければサイドバーで選んでいる）プロジェクトで始める（もうないプロジェクトは飛ばす） */
  const startNewChat = () => {
    const target = projectId ?? fallbackProject;
    if (target) openNewChat(target);
    // いきなり新しいプロジェクトのダイアログを開かず、チャットはプロジェクトの中で始めることを説明してから作るよう誘う
    else setNoProjectsGuide(true);
  };

  /** ⌘⇧F: 開いている（なければサイドバーで選んでいる）プロジェクトの検索タブへ移り、検索の欄にピントを置く */
  const openCodeSearch = () => {
    const target = projectId ?? fallbackProject;
    if (target === undefined) return setNoProjectsGuide(true);
    openProjectSearch(target);
    requestCodeSearchFocus();
  };

  // 会話の文字の大きさ（<html> の CSS 変数）
  useApplyChatFontSize();
  useAppShortcuts({
    toggleSidebar: sidebar.toggle,
    openPalette: () => setPalette(true),
    openCodeSearch,
    newChat: startNewChat,
    openSettings: () => setSettings("usage"),
    openActiveChats: () => setActiveChats({}),
  });
  // ボードの検索欄の横のボタンから、チャットの中の文言の全文検索を開く
  useWindowEvent(OPEN_CONTENT_SEARCH_EVENT, () => setSearching(true));
  // 部品から設定をその項目で開く（チャット欄のマイクから「音声入力」など。開いていれば、その項目に切り替える）
  useWindowEvent(OPEN_NEW_PROJECT_EVENT, (e) => setCreating((e as CustomEvent<NewProjectRequest>).detail));
  useWindowEvent(OPEN_NO_PROJECTS_GUIDE_EVENT, () => setNoProjectsGuide(true));
  // プロジェクトのボタン・右クリックから、そのプロジェクトで絞り込んだ ⌘⇧A の一覧を開く
  useWindowEvent(OPEN_ACTIVE_CHATS_EVENT, (e) => setActiveChats((e as CustomEvent<ActiveChatsRequest>).detail));
  useWindowEvent(OPEN_SETTINGS_EVENT, (e) => setSettings((e as CustomEvent<SettingsSection>).detail));
  // 別ウィンドウからの「ファイルタブで開く」・メモ・子チャットを開く・子チャットから親へは、このウィンドウで
  useEffect(() => subscribeWindowMessages(handleMainWindowMessage), []);

  return (
    <RouteContext.Provider value={route}>
      <ChatStatesContext.Provider value={chatStates}>
      <div {...sidebar.layout}>
        <Sidebar
          sidebar={sidebar}
          onNewChat={startNewChat}
          newChatProject={projectId ?? fallbackProject}
          onSearch={() => setPalette(true)}
          onNewProject={() => setCreating({})}
        />
        {/* 画面と、その下のパネル（ターミナル） */}
        <div className={`main-column ${bottomPanel.open && bottomPanel.maximized ? "bottom-maximized" : ""}`}>
        <main className="main">
          {showsProjectPage ? (
            // チャット・新しいチャットはプロジェクトのボードの右側のパネルで開く（同じ要素のままなので、開いているタブは残る）
            <ProjectPage
              id={route.name === "project" ? route.id : route.projectId}
              tab={route.name === "project" ? route.tab : boardTabOf(chatPlacement)}
              focus={route.name === "project" ? undefined : route}
              openFile={route.name === "project" ? route.file : undefined}
              openMemo={route.name === "project" ? route.memo : undefined}
              openMemoLine={route.name === "project" ? route.memoLine : undefined}
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
        <ToastHost />
        {/* GitHub の新しい issue・マージの確認（GitHub タブとメモ・チャットの「issue にする」から） */}
        <GitHubDialogHost />
        {/* 起動したときの送信待ちの確かめ（前回の終了で、自動で送るまま送信待ちが残ったチャットを、送るか聞く） */}
        <QueueResumeHost />
        {/* ワークツリーの PR がマージされた・閉じられた知らせ（片付けとチャットの扱いを 1 つの確認で聞く） */}
        <PrNoticeHost />
        {/* 開くボタンは、Electron のドラッグ領域より優先されるよう画面のいちばん後ろに置く */}
        <SidebarOpenButton sidebar={sidebar} />
        {/* 右上のレイアウトの開閉（ドラッグ領域より優先されるよう、開くボタンと同じく後ろに置く） */}
        <LayoutToggles
          sidebar={{ open: sidebar.open, onToggle: sidebar.toggle }}
          bottom={bottomPanel.available ? { open: bottomPanel.open, onToggle: bottomPanel.toggle } : undefined}
          chat={chat.projectId !== undefined ? { open: chat.open, onToggle: chat.toggle } : undefined}
          reveal={showsProjectPage ? projectHeaderMode : "show"}
        />
        <DialogHost />
        {/* 保存した DB のパスワードをキーチェーンで開けなかったときに、その場で聞く */}
        <DbUnlockHost />
        {/* ドラッグ中に、落とせない理由をカーソルの横に出す（作業中のチャットは移せない、など） */}
        <DropHintHost />
        {palette && <CommandPalette onClose={() => setPalette(false)} />}
        {activeChats && <ActiveChatsPalette initialProject={activeChats.projectId} onClose={() => setActiveChats(null)} />}
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
  );
}
