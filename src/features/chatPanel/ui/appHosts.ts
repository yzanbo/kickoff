// chatPanel がアプリの根に置く物: 新しいチャットを始める頼み（⌘N・サイドバーのボタン・別ウィンドウ）・⌘⇧A・消したプロジェクトの下書きの片付けと、
// 別ウィンドウ（サイドバーなど）から頼まれた、このウィンドウのパネルを変える操作・文を入れた新しいチャットのタブを開く受け手
import { useEffect } from "react";
import { open } from "@/foundation/ui/navigation/open";
import { parse, routeProjectId } from "@/foundation/ui/navigation/router";
import { onWindowMessage } from "@/foundation/ui/navigation/windowBus";
import { onAppDialogRequested, openAppDialog, type AppHost } from "@/foundation/ui/shell/points";
import { openChatTab } from "@/features/chat/ui";
import { projectInView, useProjects } from "@/features/projects/ui";
import { ActiveChatsDialog } from "./drafts/ActiveChatsDialog";
import { discardDraft, forgetDraftsOfMissingProjects, moveDraftToProject, openDraft, openDraftSplit, setDraftGroup, setDraftTitle, togglePinDraft } from "./drafts/panelDrafts";
import { openSeededChat } from "./openSeededChat";
import type { PanelOp } from "./windowMessages";

/** 新しいチャット: 開いている（なければサイドバーで選んでいる）プロジェクトで始める（もうないプロジェクトは飛ばす） */
function startNewChat() {
  const target = projectInView(routeProjectId(parse(location.hash)));
  if (target) open({ kind: "newChat", projectId: target });
  // いきなり新しいプロジェクトのダイアログを開かず、チャットはプロジェクトの中で始めることを説明してから作るよう誘う
  else openAppDialog("noProjectsGuide");
}

/** サイドバーの別ウィンドウから頼まれた、このウィンドウのパネルを変える操作 */
function runPanelOp(o: PanelOp) {
  if (o.op === "openDraft") openDraft(o.draft);
  else if (o.op === "openDraftSplit") openDraftSplit(o.draft, o.dir);
  else if (o.op === "setDraftTitle") setDraftTitle(o.draft, o.title);
  else if (o.op === "moveDraftToProject") moveDraftToProject(o.draft, o.projectId);
  else if (o.op === "setDraftGroup") setDraftGroup(o.draft, o.group, o.groupName);
  else if (o.op === "togglePinDraft") togglePinDraft({ ...o.draft, pinned: o.pinned });
  else if (o.op === "discardDraft") discardDraft(o.draft);
  else openChatTab(o.chat, { split: o.dir });
}

function useChatPanelRequests() {
  useEffect(() => {
    const offs = [
      onAppDialogRequested((r) => {
        if (r.id === "newChat") startNewChat();
      }),
      onWindowMessage("panelOp", runPanelOp),
      onWindowMessage("openSeededChat", (m) => openSeededChat(m.projectId, m.place, m)),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, []);
  // 消したプロジェクトの下書き（再起動しても残すもの）を片付ける（一覧が届いてから）
  const { projects, loaded } = useProjects();
  useEffect(() => {
    if (loaded) forgetDraftsOfMissingProjects(new Set(projects.map((p) => p.id)));
  }, [projects, loaded]);
}

export const chatPanelHosts: AppHost[] = [
  { id: "chatPanel.requests", windows: "main", useEffect: useChatPanelRequests },
  { id: "activeChats", windows: "main", order: 250, dialog: { id: "activeChats", Dialog: ActiveChatsDialog } },
];
