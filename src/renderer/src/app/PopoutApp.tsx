import { useMemo } from "react";
import { publishServerEvent } from "@/api/events";
import { useServerConnection } from "@/api/useServerConnection";
import { useApprovals } from "@/stores/approvals";
import { useProjects } from "@/stores/projects";
import { HoverTip } from "@/ui/HoverTip";
import { MemoProgress } from "@/features/memo/MemoProgress";
import { DialogHost } from "@/ui/dialogs";
import { useApplyChatFontSize } from "@/features/chat/pane/chatFontSize";
import { setProjectHues } from "@/features/project/projectColor";
import { PlanUsageContext, usePlanUsage } from "@/features/usage/usage";
import { PopoutFiles } from "@/features/popout/PopoutFiles";
import { PopoutSubagent } from "@/features/popout/PopoutSubagent";
import { PopoutChildChat } from "@/features/popout/PopoutChildChat";
import { SideMemo } from "@/features/memo/SideMemo";
import { AskChildHost } from "@/features/chat/children/AskChildHost";
import { ChatStatesContext, indexApprovals } from "./chatStatesContext";
import type { PopoutRoute } from "./popout";
import { RouteContext, useHashRoute } from "./router";

/**
 * 別ウィンドウ（チャットの画面の右の欄の変更・ファイル・サブエージェント・子チャット・メモ）の画面。メインのウィンドウの App は使わない
 * （サイドバー・通知・ショートカット・下の帯などを 2 つ動かさないため）。サーバーとのつながり・回答待ち・プロジェクトの色・会話の文字の大きさだけを持つ。
 * 表示の設定は localStorage をメインのウィンドウと共有し、書き換えは storage の知らせでそろう（lib/storage）
 */
export function PopoutApp({ route }: { route: PopoutRoute }) {
  const hashRoute = useHashRoute();
  useServerConnection(publishServerEvent);
  const planUsage = usePlanUsage();
  const { projects } = useProjects();
  setProjectHues(projects);
  const approvals = useApprovals();
  const chatStates = useMemo(() => indexApprovals(approvals), [approvals]);
  useApplyChatFontSize();
  return (
    <PlanUsageContext.Provider value={planUsage}>
      <RouteContext.Provider value={hashRoute}>
        <ChatStatesContext.Provider value={chatStates}>
          <div className="popout">
            {route.kind === "subagent" ? (
              <PopoutSubagent chatId={route.chatId} agentKey={route.agentKey} />
            ) : route.kind === "chat" ? (
              <PopoutChildChat chatId={route.chatId} />
            ) : route.kind === "memo" ? (
              <div className="popout-body">
                <SideMemo projectId={route.projectId} path={route.path} />
              </div>
            ) : (
              <PopoutFiles route={route} />
            )}
          </div>
          <HoverTip />
          <MemoProgress />
          <AskChildHost />
          <DialogHost />
        </ChatStatesContext.Provider>
      </RouteContext.Provider>
    </PlanUsageContext.Provider>
  );
}
