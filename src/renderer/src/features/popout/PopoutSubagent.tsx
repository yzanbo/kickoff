import { useMemo } from "react";
import { openPopout } from "@/app/popout";
import { postToMainWindow } from "@/app/windowBus";
import { ChatPaneContext, type ChatPaneActions } from "@/features/chat/pane/chatPaneContext";
import { useChatDetail } from "@/features/chat/pane/useChatDetail";
import { useChatView, type ChatViewInput } from "@/features/chat/pane/useChatView";
import { pickedInReply, SelectionCommentBox } from "@/features/chat/messages/SelectionComment";
import { SubagentScreen } from "@/features/chat/subagents/SubagentScreen";
import { SubagentsContext } from "@/features/chat/subagents/subagentsContext";
import { FileLinksProvider } from "@/features/fileLinks/FileLinksProvider";
import { usePopoutFileLinks } from "./PopoutFiles";

/** 別ウィンドウのサブエージェントの画面: チャットの中身を読み、右の欄と同じ SubagentScreen を描く */
export function PopoutSubagent({ chatId, agentKey }: { chatId: number; agentKey: string }) {
  const { chat, project, events, approvals, live, streaming, error } = useChatDetail(chatId);
  if (error) return <div className="page error">{error}</div>;
  if (!chat) return <div className="page muted">読み込み中…</div>;
  return <PopoutSubagentView key={chat.id} agentKey={agentKey} chat={chat} project={project} events={events} approvals={approvals} live={live} streaming={streaming} />;
}

/**
 * チャットの画面と同じ状態と操作（useChatView）で、サブエージェントの画面だけを描く。メインの会話・右の欄が要る操作はこのウィンドウにないので、
 * ほかのサブエージェントの画面は別ウィンドウで開き、会話のその場所へ移る・動きを開く・チャット欄に足すは、メインのウィンドウに知らせる
 */
function PopoutSubagentView({ agentKey, ...input }: ChatViewInput & { agentKey: string }) {
  const view = useChatView(input, false);
  const { chat } = input;
  const pane = useMemo<ChatPaneActions>(() => {
    const base = view.pane;
    const openScreen = (key: string) => {
      const entry = view.subagentsView.tree.byKey.get(key);
      openPopout({ kind: "subagent", chatId: chat.id, agentKey: key }, `${entry?.description ?? "サブエージェント"} — サブエージェント`);
    };
    const reveal = (eventId: number | undefined, agent: string | null) => postToMainWindow({ type: "reveal", chatId: chat.id, eventId, agent });
    return {
      ...base,
      openSubagentSide: (key) => openScreen(key),
      openSubagent: (key) => openScreen(key),
      revealSubagent: (key, inside) => reveal(inside, key),
      revealInConversation: reveal,
      show: (showing, filter) => {
        if (showing === "activity" && filter?.kind === "agent") postToMainWindow({ type: "showActivity", chatId: chat.id, agent: filter.key });
      },
      fillComposer: (text) => postToMainWindow({ type: "fillComposer", chatId: chat.id, text }),
    };
    // チャットの画面の操作はチャットごとに 1 回だけ作る（view.pane と同じ）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.pane]);
  const links = usePopoutFileLinks(view.fileLinks, { chatId: chat.id, projectId: chat.project_id, worktree: chat.worktree_path ?? undefined });
  return (
    <FileLinksProvider value={links}>
      <ChatPaneContext.Provider value={pane}>
        <SubagentsContext.Provider value={view.subagentsView}>
          <div className="popout-body">
            <SubagentScreen agentKey={agentKey} />
          </div>
          <SelectionCommentBox pick={() => pickedInReply(document.body)} onAdd={(text) => postToMainWindow({ type: "fillComposer", chatId: chat.id, text })} />
        </SubagentsContext.Provider>
      </ChatPaneContext.Provider>
    </FileLinksProvider>
  );
}
