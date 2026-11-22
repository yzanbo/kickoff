import { useLayoutEffect, useState } from "react";
import { bootMark } from "@/foundation/ui/lib/bootMarks";
import { useServerConnection } from "@/foundation/ui/api/serverConnection";
import { parse, RouteContext, routeProjectId, useHashRoute } from "@/foundation/ui/navigation/router";
import { useNavigationHistory } from "@/foundation/ui/navigation/useNavigationHistory";
import { createNavigationHistory } from "@/foundation/ui/navigation/navigationHistory";
import { MaximizedHeader, MaximizedHeaderBar } from "@/foundation/ui/shell/WindowHeaderContent";
import { AppHosts, AppShell } from "@/foundation/ui/shell/AppShell";
import { openAppDialog } from "@/foundation/ui/shell/points";
import { useCommandHandler } from "@/foundation/ui/commands";
import { AppFooter } from "@/app/renderer/shell/footer/AppFooter";
import { BottomPanel } from "@/features/terminal/ui/bottom/BottomPanel";
import { useBottomPanel } from "@/features/terminal/ui/bottom/useBottomPanel";
import { terminalTargets } from "@/features/terminal/ui/bottom/terminalTargets";
import { useProjectHeaderMode } from "@/features/projects/ui/page/headerMode";
import { ProjectChat } from "@/features/projects/ui/rightSidebar/RightSidebar";
import { useProjectChat } from "@/features/projects/ui/rightSidebar/useRightSidebar";
import { SideRail } from "@/features/projects/ui/rightSidebar/SideRail";
import { ProjectPage } from "@/features/projects/ui/page/ProjectPage";
import { boardTabOf, useChatPlacement } from "@/features/projects/ui/page/chatPlacement";
import { useFallbackProject, useProjects, useExistingProject } from "@/features/projects/ui";
import { Sidebar, SidebarOpenButton } from "@/features/sidebar/ui/Sidebar";
import { useSidebar } from "@/features/sidebar/ui/useSidebar";
import { usePopoutHosts } from "@/features/sidebar/ui/popoutHosts";
import { AllProjectsPage } from "@/features/board/ui/AllProjectsPage";
import { LayoutToggles } from "./LayoutToggles";
import { NavigationButtons } from "./NavigationButtons";
import { historySteps } from "./commands";

/** ドラッグ領域より後ろに置く物（開くボタン・戻る進む・レイアウトの開閉）より前に置く、根の物の order の上限 */
const BEFORE_TOGGLES = 200;

/**
 * メインのウィンドウの画面: 殻（AppShell。根に置く物・全体の副作用・ダイアログは持ち主が appHosts に入れる）と、
 * 配置（サイドバー・プロジェクトの画面 / 全プロジェクト・下のパネル・右サイドバー・右端の列・下の帯・レイアウトの開閉）
 */
export function App() {
  // 最初の描き終わり（起動の時刻の記録。いちばん外の部品なので、中の部品の layout effect のあと）
  useLayoutEffect(() => bootMark("firstCommit"), []);
  // URL（ハッシュ）はここで 1 回だけ購読し、部品は useRoute()（RouteContext）で読む
  const [routeHistory] = useState(() => createNavigationHistory(parse(location.hash)));
  const route = useHashRoute((next, replace) => routeHistory.record(next, replace));
  // サーバーとつなぎ、届いた知らせを各画面と店（stores/）に配る（ここで 1 回だけ）
  useServerConnection();
  const { projects } = useProjects();
  const sidebar = useSidebar();
  // URL のプロジェクト（もうないとわかったものは、ないものとする）
  const projectId = useExistingProject(routeProjectId(route));
  // URL にプロジェクトがない画面（全プロジェクト）で使うプロジェクト: サイドバーで最後に選んでいたもの（もうなければ先頭）。
  // ⌘N の新しいチャットの作成先と、チャット欄の持ち主（全プロジェクトのボードの「新規」も同じ）
  const fallbackProject = useFallbackProject();
  // サイドバー・チャット欄の別ウィンドウが開いている間、いまの画面とパネルの状態を送る（チャット欄は状態ごと渡し、このウィンドウでは描かない）
  const { sideHeld } = usePopoutHosts(route);
  // プロジェクトのチャット欄（画面の右端に、下のパネルより下まで。全プロジェクトの画面では、サイドバーで選んでいるプロジェクトのもの）
  const chat = useProjectChat(projectId ?? fallbackProject, { inWindow: sideHeld });
  // 下のパネルのターミナル（プロジェクトごと。全プロジェクトの画面ではすべてのプロジェクトのものを出し、開くときにプロジェクトを選ぶ）
  const bottomPanel = useBottomPanel(projectId ?? "all", terminalTargets(projects, projectId));
  // 戻る・進むの行き先が、最大表示したパネルの裏に隠れないようにする
  const navigation = useNavigationHistory(routeHistory, () => {
    if (chat.open && chat.maximized && !sideHeld) chat.setMaximized(false);
    if (bottomPanel.open && bottomPanel.maximized) bottomPanel.toggleMaximized();
  });
  useCommandHandler(historySteps, navigation.step);
  // チャットを開く場所（ボードと分けた「チャット」タブ / ボードの右のパネル）
  const [chatPlacement] = useChatPlacement();
  // プロジェクトの画面（チャット・新しいチャットもその中に出す）では、右上のレイアウトの開閉を見出しの行の出し方に合わせる
  const [projectHeaderMode] = useProjectHeaderMode();
  const showsProjectPage = route.name === "project" || route.name === "chat" || route.name === "newChat";

  return (
    <RouteContext.Provider value={route}>
      <AppShell window="main" projectId={projectId}>
      <div {...sidebar.layout}>
        <MaximizedHeader active={(bottomPanel.available && bottomPanel.open && bottomPanel.maximized) || (!sideHeld && chat.open && chat.maximized)}>
        <Sidebar
          sidebar={sidebar}
          onNewChat={() => openAppDialog("newChat")}
          newChatProject={projectId ?? fallbackProject}
          onSearch={() => openAppDialog("commandPalette")}
          onNewProject={() => openAppDialog("newProject", {})}
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
        <AppFooter projectId={projectId} />
        <AppHosts window="main" to={BEFORE_TOGGLES} />
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
        <AppHosts window="main" from={BEFORE_TOGGLES} />
        </MaximizedHeader>
      </div>
      </AppShell>
    </RouteContext.Provider>
  );
}
