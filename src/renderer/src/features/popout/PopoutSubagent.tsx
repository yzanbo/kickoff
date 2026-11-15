import { useMemo } from "react";
import { openPopout } from "@/app/popout";
import { postToMainWindow } from "@/app/windowBus";
import { ChatPaneContext, type ChatPaneActions } from "@/features/chat/pane/chatPaneContext";
import { useOpenChat } from "@/features/chat/store/useChatStore";
import { useChatView, type ChatViewInput } from "@/features/chat/pane/useChatView";
import { useChatPaneActions } from "@/features/chat/pane/useChatPaneActions";
import { useFileLinks } from "@/features/fileLinks/useFileLinks";
import { SubagentScreen } from "@/features/chat/subagents/SubagentScreen";
import { FileLinksProvider } from "@/features/fileLinks/FileLinksProvider";
import { usePopoutFileLinks } from "./PopoutFiles";

/**
 * 別ウィンドウのサブエージェントの画面: チャットの中身をチャットの店から読み、右の欄と同じ SubagentScreen を描く
 * （メインエージェントの書いている途中の返答は出さないので、途中の文の口は読まない = 返答中に描き直さない）
 */
export function PopoutSubagent({ chatId, agentKey }: { chatId: number; agentKey: string }) {
  const { chat, project, error } = useOpenChat(chatId, true);
  if (error) return <div className="page error">{error}</div>;
  if (!chat) return <div className="page muted">読み込み中…</div>;
  return <PopoutSubagentView key={chat.id} agentKey={agentKey} chat={chat} project={project} />;
}

/**
 * チャットの画面と同じ状態と操作（useChatView）で、サブエージェントの画面だけを描く。メインの会話・右の欄が要る操作はこのウィンドウにないので、
 * ほかのサブエージェントの画面は別ウィンドウで開き、会話のその場所へ移る・動きで強調する・チャット欄に足すは、メインのウィンドウに知らせる
 */
function PopoutSubagentView({ agentKey, ...input }: ChatViewInput & { agentKey: string }) {
  const { chat } = input;
  const shell = useChatPaneActions({ chatId: chat.id, canOpenSide: false });
  const view = useChatView(input, shell);
  const fileLinks = useFileLinks(chat, input.project?.repo_path, false);
  const pane = useMemo<ChatPaneActions>(() => {
    const base = shell.pane;
    const openScreen = (key: string) => {
      const entry = view.subagentsView?.tree.byKey.get(key);
      openPopout({ kind: "subagent", chatId: chat.id, agentKey: key }, `${entry?.description ?? "サブエージェント"} — サブエージェント`);
    };
    const reveal = (eventId: number | undefined, agent: string | null) => postToMainWindow({ type: "reveal", chatId: chat.id, eventId, agent });
    return {
      ...base,
      openSubagentSide: (key) => openScreen(key),
      openSubagentWindow: (key) => openScreen(key),
      openSubagent: (key) => openScreen(key),
      revealSubagent: (key, inside) => reveal(inside, key),
      revealInConversation: reveal,
      focusActivity: (key) => postToMainWindow({ type: "showActivity", chatId: chat.id, agent: key }),
      fillComposer: (text) => postToMainWindow({ type: "fillComposer", chatId: chat.id, text }),
    };
    // チャットの画面の操作はチャットごとに 1 回だけ作る（shell.pane と同じ）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shell.pane]);
  const links = usePopoutFileLinks(fileLinks, { chatId: chat.id, projectId: chat.project_id, worktree: chat.worktree_path ?? undefined });
  return (
    <FileLinksProvider value={links}>
      <ChatPaneContext.Provider value={pane}>
        <div className="popout-body">
          <SubagentScreen chatId={chat.id} agentKey={agentKey} />
        </div>
      </ChatPaneContext.Provider>
    </FileLinksProvider>
  );
}
