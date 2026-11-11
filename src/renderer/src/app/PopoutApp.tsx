import { useMemo, useRef } from "react";
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
import { DialogHost } from "@/ui/dialogs";
import { useApplyChatFontSize } from "@/features/chat/pane/chatFontSize";
import { setProjectHues } from "@/features/project/projectColor";
import { PopoutFiles } from "@/features/popout/PopoutFiles";
import { PopoutSubagent } from "@/features/popout/PopoutSubagent";
import { PopoutChildChat } from "@/features/popout/PopoutChildChat";
import { SideMemo } from "@/features/memo/SideMemo";
import { DatabaseClient } from "@/features/database/DatabaseClient";
import { SideScope } from "@/features/popout/SideScope";
import { PopoutDockButton } from "@/features/popout/PopoutDockButton";
import { AskChildHost } from "@/features/chat/children/AskChildHost";
import { ChatStatesContext, indexApprovals } from "./chatStatesContext";
import { popoutPath, type PopoutRoute } from "./popout";
import { RouteContext, useHashRoute } from "./router";

/** 上の帯の、何のウィンドウかの札 */
const POPOUT_LABELS: Record<PopoutRoute["kind"], string> = { changes: "変更", file: "ファイル", subagent: "サブエージェント", chat: "子チャット", memo: "メモ", database: "DB" };

/**
 * 別ウィンドウ（チャットの画面の右の欄の変更・ファイル・サブエージェント・子チャット・メモ・DB クライアント）の画面。メインのウィンドウの App は使わない
 * （サイドバー・通知・ショートカット・下の帯などを 2 つ動かさないため）。サーバーとのつながり・回答待ち・プロジェクトの色・会話の文字の大きさだけを持つ。
 * 表示の設定は localStorage をメインのウィンドウと共有し、書き換えは storage の知らせでそろう（lib/storage）。
 * ⌘F は、ウィンドウの中を探す（ファイル・メモはエディタの検索、ほかは右上の検索の欄。子チャットはチャットの中の検索が先に受け取る）
 */
export function PopoutApp({ route }: { route: PopoutRoute }) {
  const hashRoute = useHashRoute();
  useServerConnection(publishServerEvent);
  const { projects } = useProjects();
  setProjectHues(projects);
  const approvals = useApprovals();
  const chatStates = useMemo(() => indexApprovals(approvals), [approvals]);
  useApplyChatFontSize();
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
    <RouteContext.Provider value={hashRoute}>
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
                  <DatabaseClient projectId={route.projectId} place={`chat-${route.chatId}`} worktree={route.worktree ?? null} />
                </div>
              ) : (
                <PopoutFiles route={route} />
              )}
            </SideScope>
          )}
        </div>
        <HoverTip />
        <MemoProgress />
        <AskChildHost />
        <DialogHost />
      </ChatStatesContext.Provider>
    </RouteContext.Provider>
  );
}
