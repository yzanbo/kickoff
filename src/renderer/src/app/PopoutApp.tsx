import { useLayoutEffect, useMemo, useRef } from "react";
import { bootMark } from "./bootMarks";
import { useUserViewReport } from "./userViewReport";
import { collectPopoutView, popoutChatIds } from "./userViewCollect";
import { publishServerEvent } from "@/api/events";
import { useServerConnection } from "@/api/useServerConnection";
import { useApprovals } from "@/stores/approvals";
import { useProjects } from "@/stores/projects";
import { HoverTip } from "@/ui/HoverTip";
import { runPageFind } from "@/ui/pageFind";
import { usePageFind } from "@/ui/usePageFind";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { isKey } from "@/lib/keys";
import { saveAll } from "@/lib/saveAll";
import { openEditorFind } from "@/features/editor/editorFind";
import { MemoProgress } from "@/features/memo/MemoProgress";
import { ToastHost } from "@/ui/toast";
import { CoreStatusBand } from "@/features/diagnostics/CoreStatusBand";
import { DialogHost } from "@/ui/dialogs";
import { DbUnlockHost } from "@/features/database/DbUnlockHost";
import { useApplyChatFontSize } from "@/features/chat/pane/chatFontSize";
import { setProjectHues } from "@/features/project/projectColor";
import { PopoutFiles } from "@/features/popout/PopoutFiles";
import { PopoutSubagent } from "@/features/popout/PopoutSubagent";
import { PopoutChildChat } from "@/features/popout/PopoutChildChat";
import { PopoutSidebar } from "@/features/popout/PopoutSidebar";
import { PopoutSideChat } from "@/features/popout/PopoutSideChat";
import { PopoutBrowser, PopoutTerminal } from "@/features/popout/PopoutPanelTab";
import { SideMemo } from "@/features/memo/SideMemo";
import { LazyDatabaseClient } from "@/features/database/LazyDatabaseClient";
import { SideScope } from "@/features/popout/SideScope";
import { PopoutDockButton } from "@/features/popout/PopoutDockButton";
import { GitHubDialogHost } from "@/features/github/GitHubDialogHost";
import { ChatStatesContext, indexApprovals } from "./chatStatesContext";
import { popoutPath, type PopoutRoute } from "./popout";
import { usePopoutForwarding } from "./popoutNavigation";
import { useAgentBrowserBridge } from "./agentBrowser";

/** 上の帯の、何のウィンドウかの札 */
const POPOUT_LABELS: Record<PopoutRoute["kind"], string> = { changes: "変更", file: "ファイル", subagent: "サブエージェント", chat: "子チャット", memo: "メモ", database: "DB", sidebar: "サイドバー", side: "右サイドバー", browser: "ブラウザ", terminal: "ターミナル" };

/**
 * 別ウィンドウ（チャットの画面の右の欄の変更・ファイル・サブエージェント・子チャット・メモ・DB クライアントと左のサイドバー）の画面。メインのウィンドウの App は使わない
 * （サイドバー・通知・ショートカット・下の帯などを 2 つ動かさないため）。サーバーとのつながり・回答待ち・プロジェクトの色・会話の文字の大きさだけを持つ。
 * 表示の設定は localStorage をメインのウィンドウと共有し、書き換えは storage の知らせでそろう（lib/storage）。
 * ⌘F は、ウィンドウの中を探す（ファイル・メモはエディタの検索、ほかは右上の検索の欄。子チャットはチャットの中の検索が先に受け取る）
 */
export function PopoutApp({ route }: { route: PopoutRoute }) {
  // 最初の描き終わり（起動の時刻の記録。app/bootMarks.ts）
  useLayoutEffect(() => bootMark("firstCommit"), []);
  useServerConnection(publishServerEvent);
  const { projects } = useProjects();
  setProjectHues(projects);
  const approvals = useApprovals();
  const chatStates = useMemo(() => indexApprovals(approvals), [approvals]);
  useApplyChatFontSize();
  // 中で画面を移る操作（リンク・サイドバーの行）と、設定・⌘⇧A などのダイアログは、メインのウィンドウで開く
  usePopoutForwarding(route);
  // AI（kickoff_browser）が埋め込みブラウザのタブを開く・表に出す・操作している印（チャット欄・ブラウザのタブの別ウィンドウ。ほかのウィンドウでは受け持たずに断る）
  useAgentBrowserBridge();
  // 利用者が見ているもの（このウィンドウの中身。AI の get_user_view が読む）
  useUserViewReport(() => collectPopoutView(route), (view) => popoutChatIds(view, route), [route]);
  const rootRef = useRef<HTMLDivElement>(null);
  const find = usePageFind(rootRef, { native: openEditorFind, placeholder: "このウィンドウを検索", className: "page-find" });
  useWindowEvent("keydown", (e) => {
    if (e.defaultPrevented) return;
    // ⌘⇧S: すべて保存（このウィンドウのメモ・ファイル。メインのウィンドウと同じ）
    if (isKey(e, "s", { meta: true, shift: true }) || isKey(e, "s", { ctrl: true, shift: true })) {
      e.preventDefault();
      void saveAll();
      return;
    }
    if (!(isKey(e, "f", { meta: true }) || isKey(e, "f", { ctrl: true }))) return;
    if (runPageFind()) e.preventDefault();
  });
  return (
    // URL は別ウィンドウの行き先なので、画面の URL として購読しない（useHashRoute は見ている画面を LAST_ROUTE に覚えるので、
    // 別ウィンドウを開くたびに「最後に見ていた画面」が全プロジェクトに上書きされていた）。useRoute() は初めの値（全プロジェクト）
    <>
      <ChatStatesContext.Provider value={chatStates}>
        <div ref={rootRef} className="popout">
          {find}
          {route.kind !== "chat" && (
            // 上の細い帯（子チャットは自分の帯に同じボタンを置く）
            <div className="popout-bar">
              <span className="popout-bar-label">{POPOUT_LABELS[route.kind]}</span>
              <span className="spacer" />
              <PopoutDockButton route={route} />
            </div>
          )}
          {route.kind === "chat" ? (
            // 子チャットは、いちばん上の親を「メインのチャット」にする（自分で SideScope を置く）
            <PopoutChildChat chatId={route.chatId} />
          ) : route.kind === "sidebar" ? (
            <div className="popout-body">
              <PopoutSidebar />
            </div>
          ) : route.kind === "side" ? (
            <PopoutSideChat />
          ) : route.kind === "browser" ? (
            <PopoutBrowser route={route} />
          ) : route.kind === "terminal" ? (
            <PopoutTerminal route={route} />
          ) : (
            // 右の欄と同じく、開いたチャットを「メインのチャット」に（右クリックの組・選んだときの「チャットに追加」）
            <SideScope mainChatId={route.chatId ?? null}>
              {route.kind === "subagent" ? (
                <PopoutSubagent chatId={route.chatId} agentKey={route.agentKey} />
              ) : route.kind === "memo" ? (
                <div className="popout-body">
                  <SideMemo
                    projectId={route.projectId}
                    path={route.path}
                    chatId={route.chatId ?? null}
                    // 名前を変えたら、ウィンドウの URL も新しい名前に（読み込み直しても同じメモを開く）
                    onRenamed={(to) => history.replaceState(null, "", `#${popoutPath({ ...route, path: to })}`)}
                  />
                </div>
              ) : route.kind === "database" ? (
                <div className="popout-body">
                  <LazyDatabaseClient projectId={route.projectId} place={`chat-${route.chatId}`} worktree={route.worktree ?? null} />
                </div>
              ) : (
                <PopoutFiles route={route} />
              )}
            </SideScope>
          )}
        </div>
        <HoverTip />
        <MemoProgress />
        <ToastHost />
        <CoreStatusBand />
        {/* GitHub の新しい issue・マージの確認（GitHub タブとメモ・チャットの「issue にする」から） */}
        <GitHubDialogHost />
        <DbUnlockHost />
        <DialogHost />
      </ChatStatesContext.Provider>
    </>
  );
}
