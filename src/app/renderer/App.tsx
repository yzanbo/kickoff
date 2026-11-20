import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useState } from "react";
import { bootMark } from "@/foundation/ui/lib/bootMarks";
import { useServerConnection } from "@/foundation/ui/api/serverConnection";
import { useApprovals } from "@/features/chat/ui/store/approvals";
import { addProject, useProjects } from "@/features/projects/ui/stores/projects";
import { useAppSettings } from "@/features/settings/ui/stores/settings";
import { AppFooter } from "@/app/renderer/shell/footer/AppFooter";
import { BottomPanel } from "@/features/terminal/ui/bottom/BottomPanel";
import { useBottomPanel } from "@/features/terminal/ui/bottom/useBottomPanel";
import { ActiveChatsPalette } from "@/features/chatList/ui/activeChats/ActiveChatsPalette";
import { CommandPalette } from "@/features/palette/ui/CommandPalette";
import { LayoutToggles } from "./LayoutToggles";
import { useProjectHeaderMode } from "@/features/projects/ui/page/headerMode";
import { SearchPanel } from "@/features/palette/ui/SearchPanel";
import { NewProjectDialog } from "@/features/projects/ui/new/NewProjectDialog";
import { NoProjectsGuide } from "@/features/projects/ui/NoProjectsGuide";
import { runAfterNewProject } from "@/features/projects/ui/new/afterNewProject";
import { ProjectChat } from "@/features/projects/ui/rightSidebar/RightSidebar";
import { useProjectChat } from "@/features/projects/ui/rightSidebar/useRightSidebar";
import { SideRail } from "@/features/projects/ui/rightSidebar/SideRail";
import { SettingsDialog } from "@/features/settings/ui/SettingsDialog";
import { CoreStatusBand } from "@/features/diagnostics/ui/CoreStatusBand";
import { DiagnosticsIndicator } from "@/features/diagnostics/ui/DiagnosticsIndicator";
import { HoverTip } from "@/foundation/ui/kit/HoverTip";
import { NoteProgress } from "@/features/notes/ui/NoteProgress";
import { ToastHost } from "@/foundation/ui/kit/toast";
import { GitHubDialogHost } from "@/features/github/ui/GitHubDialogHost";
import { RestartResumeHost } from "@/features/queue/ui/restartResume/RestartResumeDialog";
import { PrNoticeHost } from "@/features/github/ui/prNotice/PrNoticeDialog";
import { Sidebar, SidebarOpenButton } from "@/features/sidebar/ui/Sidebar";
import { useFallbackProject } from "@/features/projects/ui/currentProject";
import { requestCodeSearchFocus } from "@/features/files/ui/codeSearchFocus";
import { useSidebar } from "@/features/sidebar/ui/useSidebar";
import { terminalTargets } from "@/features/panel/ui/usePanel";
import { DialogHost } from "@/foundation/ui/kit/dialogs";
import { LinkOpenerProvider } from "@/foundation/ui/external/LinkOpenerProvider";
import { DbUnlockHost } from "@/features/database/ui/DbUnlockHost";
import { DropHintHost } from "@/foundation/ui/kit/DropHint";
import { useNotificationTargets, useViewingReport } from "@/features/notifications/ui/notifications";
import { useUserViewReport } from "@/features/userView/ui/userViewReport";
import { chatIdsOf, collectUserView } from "@/features/userView/ui/userViewCollect";
import { useDockBadge } from "@/features/notifications/ui/dockBadge";
import { useAgentBrowserBridge } from "@/features/browser/ui/agentBrowser";
import { useAiOpenRequests } from "@/features/chat/ui/open/aiOpenRequests";
import { useWorkplaceMoveTabs } from "@/features/workplaceMove/ui/repointTabs";
import { AllProjectsPage } from "@/features/board/ui/AllProjectsPage";
import { ProjectPage } from "@/features/projects/ui/page/ProjectPage";
import { open as openTarget } from "@/foundation/ui/navigation/open";
import { parse, RouteContext, routeProjectId, useHashRoute } from "@/foundation/ui/navigation/router";
import { receiveMainWindowMessages } from "./mainWindowMessages";
import { usePopoutHosts } from "./popoutHosts";
import { boardTabOf, useChatPlacement } from "@/features/projects/ui/page/chatPlacement";
import { useNavigationHistory } from "@/foundation/ui/navigation/useNavigationHistory";
import { NavigationButtons } from "@/foundation/ui/navigation/NavigationButtons";
import { MaximizedHeader, MaximizedHeaderBar } from "@/foundation/ui/shell/WindowHeaderContent";
import { onAppDialogRequested, type AppDialogMap, type AppDialogRequest } from "@/foundation/ui/shell/points";
import { createNavigationHistory } from "@/foundation/ui/navigation/navigationHistory";
import { useAppShortcuts } from "./shortcuts";
import { usePlanUsage } from "@/features/ai/ui/usage/usage";
import { setProjectHues } from "@/features/projects/ui/projectColor";
import { forgetDraftsOfMissingProjects } from "@/features/chatPanel/ui/drafts/panelDrafts";
import { useApplyChatFontSize } from "@/features/conversation/ui/screen/chatFontSize";
import { ChatStatesContext, indexApprovals } from "@/features/chat/ui/state/chatStates";

/** 開いているダイアログから、その種類を外したもの */
function withoutDialog(open: Partial<AppDialogMap>, id: keyof AppDialogMap): Partial<AppDialogMap> {
  const next = { ...open };
  delete next[id];
  return next;
}

export function App() {
  // 最初の描き終わり（起動の時刻の記録。いちばん外の部品なので、中の部品の layout effect のあと）
  useLayoutEffect(() => bootMark("firstCommit"), []);
  // URL（ハッシュ）はここで 1 回だけ購読し、部品は useRoute()（RouteContext）で読む
  const [routeHistory] = useState(() => createNavigationHistory(parse(location.hash)));
  const route = useHashRoute((next, replace) => routeHistory.record(next, replace));
  const planUsage = usePlanUsage();
  // サーバーとつなぎ、届いた知らせを各画面と店（stores/）に配る（ここで 1 回だけ）
  const connection = useServerConnection();
  // アプリ全体で使うデータ（プロジェクト・回答待ち・設定）は店から読む（要る部品も、props で中継せずに店から読む）
  const { projects, missing: missingProject, loaded: projectsLoaded } = useProjects();
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
  // 通知（完了・失敗・回答待ち・CI の失敗）を出すかはコアが決める。画面は見ているものを知らせ、通知が押されたら開く
  useViewingReport(route);
  useNotificationTargets();
  // 利用者が見ているもの（このウィンドウのペインごとの前のタブ・選んでいる範囲など。AI の get_user_view が読む）
  useUserViewReport(() => collectUserView(route), (view) => chatIdsOf(view, route), [route]);
  // 要対応（回答待ち・未読）の数を Dock のアイコンの赤い数字で出す（設定で切り替え。設定が届くまでは出す）
  useDockBadge({ enabled: appSettings?.dock_badge ?? true, projects, pending: chatStates.pending });
  // AI が埋め込みブラウザのタブを開く・操作している印
  useAgentBrowserBridge();
  // チャットの AI が頼んだノート・家系のチャットを開く（kickoff_chat の open_note・open_chat）
  useAiOpenRequests();
  // 作業場所を移したチャットの右の欄のタブを、新しい作業場所に付け替える
  useWorkplaceMoveTabs();
  const sidebar = useSidebar();
  // 開いているアプリのダイアログ（種類ごとに開くときに渡したもの。ないものは閉じている）: 新しいプロジェクト（名前の初めの値・作ったあとの処理）・
  // プロジェクトがないときの案内・⌘K・⌘⇧A（プロジェクトのボタンから開いたときは、そのプロジェクトで絞り込む）・全文検索・設定（開いている項目）
  const [dialogs, setDialogs] = useState<Partial<AppDialogMap>>({});
  const showDialog = ({ id, detail }: AppDialogRequest) => setDialogs((open) => ({ ...open, [id]: detail }));
  const closeDialog = (id: keyof AppDialogMap) => setDialogs((open) => withoutDialog(open, id));
  const { newProject: creating, settings, activeChats } = dialogs;
  // URL のプロジェクト。もうないとわかったもの（消した・URL の番号が違う）は、ないものとする
  // （チャット欄・下のパネル・下の帯に出さず、そのプロジェクトのワークツリー・グループなどを読みに行かない）
  const routeProject = routeProjectId(route) ?? undefined;
  const projectId = missingProject(routeProject) ? undefined : routeProject;
  // URL にプロジェクトがない画面（全プロジェクト）で使うプロジェクト: サイドバーで最後に選んでいたもの（もうなければ先頭）。
  // ⌘N の新しいチャットの作成先と、チャット欄の持ち主（全プロジェクトのボードの「新規」も同じ）
  const fallbackProject = useFallbackProject();
  // 下のパネルのターミナル（プロジェクトごと。全プロジェクトの画面ではすべてのプロジェクトのものを出し、開くときにプロジェクトを選ぶ）
  // プロジェクトのチャット欄（画面の右端に、下のパネルより下まで。全プロジェクトの画面では、サイドバーで選んでいるプロジェクトのもの）
  // サイドバー・チャット欄の別ウィンドウが開いている間、いまの画面とパネルの状態を送る（チャット欄は状態ごと渡し、このウィンドウでは描かない）
  const { sideHeld } = usePopoutHosts(route);
  const chat = useProjectChat(projectId ?? fallbackProject, { inWindow: sideHeld });
  const bottomPanel = useBottomPanel(projectId ?? "all", terminalTargets(projects, projectId));
  // 戻る・進むの行き先が、最大表示したパネルの裏に隠れないようにする
  const navigation = useNavigationHistory(routeHistory, () => {
    if (chat.open && chat.maximized && !sideHeld) chat.setMaximized(false);
    if (bottomPanel.open && bottomPanel.maximized) bottomPanel.toggleMaximized();
  });
  // チャット・新しいチャットの URL では、プロジェクトのボードのパネルで開く
  // チャットを開く場所（ボードと分けた「チャット」タブ / ボードの右のパネル）
  const [chatPlacement] = useChatPlacement();
  // プロジェクトの画面（チャット・新しいチャットもその中に出す）では、右上のレイアウトの開閉を見出しの行の出し方に合わせる
  const [projectHeaderMode] = useProjectHeaderMode();
  const showsProjectPage = route.name === "project" || route.name === "chat" || route.name === "newChat";

  /** 新しいチャット: 開いている（なければサイドバーで選んでいる）プロジェクトで始める（もうないプロジェクトは飛ばす） */
  const startNewChat = () => {
    const target = projectId ?? fallbackProject;
    if (target) openTarget({ kind: "newChat", projectId: target });
    // いきなり新しいプロジェクトのダイアログを開かず、チャットはプロジェクトの中で始めることを説明してから作るよう誘う
    else showDialog({ id: "noProjectsGuide", detail: null });
  };

  /** ⌘⇧F: 開いている（なければサイドバーで選んでいる）プロジェクトの検索タブへ移り、検索の欄にピントを置く */
  const openCodeSearch = () => {
    const target = projectId ?? fallbackProject;
    if (target === undefined) return showDialog({ id: "noProjectsGuide", detail: null });
    openTarget({ kind: "projectView", projectId: target, view: "search" });
    requestCodeSearchFocus();
  };

  // 会話の文字の大きさ（<html> の CSS 変数）
  useApplyChatFontSize();
  useAppShortcuts({
    toggleSidebar: sidebar.toggle,
    openPalette: () => showDialog({ id: "commandPalette", detail: null }),
    openCodeSearch,
    newChat: startNewChat,
    openSettings: () => showDialog({ id: "settings", detail: "usage" }),
    openActiveChats: () => showDialog({ id: "activeChats", detail: {} }),
  });
  // 部品・別ウィンドウから開くダイアログ（openAppDialog。設定は開いていればその項目に切り替える）と、サイドバーの別ウィンドウの「新しいチャット」
  const onDialogRequested = useEffectEvent((request: AppDialogRequest) => (request.id === "newChat" ? startNewChat() : showDialog(request)));
  useEffect(() => onAppDialogRequested(onDialogRequested), []);
  // 別ウィンドウからの「ファイルタブで開く」・ノート・子チャットを開く・子チャットから親へ・画面を移る操作は、このウィンドウで
  useEffect(() => receiveMainWindowMessages(), []);

  return (
    <RouteContext.Provider value={route}>
      <ChatStatesContext.Provider value={chatStates}>
      {/* 返答の外部リンクの開き方（確かめ・開き先） */}
      <LinkOpenerProvider projectId={projectId}>
      <div {...sidebar.layout}>
        <MaximizedHeader active={(bottomPanel.available && bottomPanel.open && bottomPanel.maximized) || (!sideHeld && chat.open && chat.maximized)}>
        <Sidebar
          sidebar={sidebar}
          onNewChat={startNewChat}
          newChatProject={projectId ?? fallbackProject}
          onSearch={() => showDialog({ id: "commandPalette", detail: null })}
          onNewProject={() => showDialog({ id: "newProject", detail: {} })}
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
              openNote={route.name === "project" ? route.note : undefined}
              openNoteLine={route.name === "project" ? route.noteLine : undefined}
            />
          ) : (
            <AllProjectsPage />
          )}
        </main>
        <BottomPanel bottom={bottomPanel} />
        </div>
        {!sideHeld && <ProjectChat chat={chat} />}
        {/* 右端のアイコンの列（右サイドバーを閉じていても・別ウィンドウへ移していても置く） */}
        {chat.projectId !== undefined && <SideRail projectId={chat.projectId} open={chat.open} held={sideHeld} />}
        <MaximizedHeaderBar />
        <AppFooter onOpenSettings={(section) => showDialog({ id: "settings", detail: section })} connection={connection} planUsage={planUsage} projectId={projectId} />
        {creating && (
          <NewProjectDialog
            defaultParentDir={appSettings?.projects_dir ?? "~/Documents"}
            initialName={creating.name}
            initialMode={creating.mode}
            onClose={() => closeDialog("newProject")}
            onCreated={(project) => {
              closeDialog("newProject");
              addProject(project);
              runAfterNewProject(creating.after, project);
            }}
          />
        )}
        {dialogs.noProjectsGuide !== undefined && <NoProjectsGuide onClose={() => closeDialog("noProjectsGuide")} />}
        {settings && <SettingsDialog key={settings} initial={settings} onClose={() => closeDialog("settings")} />}
        {/* 性能の記録の様子（メニューの「ヘルプ」・設定の「診断」から始まる） */}
        <DiagnosticsIndicator />
        {/* Kickoff のコア（別のプロセス）が落ちた・応答しないときの帯（メインプロセスが知らせる） */}
        <CoreStatusBand />
        {/* マウスを乗せたときの説明（data-tip を付けた要素。アプリ全体で 1 つ） */}
        <HoverTip />
        <NoteProgress />
        <ToastHost />
        {/* GitHub の新しい issue・マージの確認（GitHub タブとノート・チャットの「issue にする」から） */}
        <GitHubDialogHost />
        {/* 起動したときの再開の確かめ（前回の終了で、作業の途中で止まった・自動で送るまま送信待ちが残ったチャットを、続けるか・送るか聞く） */}
        <RestartResumeHost />
        {/* ワークツリーの PR がマージされた・閉じられた知らせ（片付けとチャットの扱いを 1 つの確認で聞く） */}
        <PrNoticeHost />
        {/* 開くボタンは、Electron のドラッグ領域より優先されるよう画面のいちばん後ろに置く */}
        <SidebarOpenButton sidebar={sidebar} />
        {/* 全体表示した欄のドラッグ領域より後ろに置き、いつでも押せるようにする */}
        <NavigationButtons navigation={navigation} />
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
        {dialogs.commandPalette !== undefined && <CommandPalette onClose={() => closeDialog("commandPalette")} />}
        {activeChats && <ActiveChatsPalette initialProject={activeChats.projectId} onClose={() => closeDialog("activeChats")} />}
        {dialogs.contentSearch !== undefined && (
          <SearchPanel
            chatId={route.name === "chat" ? route.chatId : undefined}
            projectId={projectId}
            onClose={() => closeDialog("contentSearch")}
          />
        )}
        </MaximizedHeader>
      </div>
      </LinkOpenerProvider>
      </ChatStatesContext.Provider>
    </RouteContext.Provider>
  );
}
