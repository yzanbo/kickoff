import { useMemo } from "react";
import { openPopout } from "@/foundation/ui/navigation/popout";
import { postToMainWindow } from "@/foundation/ui/navigation/windowBus";
import { useLatest } from "@/foundation/ui/hooks/useLatest";
import { ChatPaneContext, type ChatPaneActions } from "@/features/chat/ui/screen/ports";
import { useOpenChat } from "@/features/chat/ui/store/useChatStore";
import { useChatView, type ChatViewInput } from "@/features/conversation/ui/screen/useChatView";
import { useChatPaneActions } from "@/features/conversation/ui/screen/useChatPaneActions";
import { useFileLinks } from "@/features/files/ui/links/useFileLinks";
import { SubagentScreen } from "@/features/conversation/ui/screens/SubagentScreen";
import { FileLinksProvider } from "@/features/files/ui/links/FileLinksProvider";
import { ChatImagesProvider } from "@/features/remoteImages/ui/ChatImage";
import { PastWorkplacesProvider } from "@/features/chat/ui/screen/pastWorkplace";
import { popoutFileLinks, usePopoutFileLinks } from "@/features/files/ui/PopoutFiles";
import { ChatProviderContext } from "@/features/ai/ui";

/**
 * 別ウィンドウのサブエージェントの画面: チャットの中身をチャットの店から読み、右の欄と同じ SubagentScreen を描く
 * （メインエージェントの書いている途中の返答は出さないので、途中の文の口は読まない = 返答中に描き直さない）
 */
export function PopoutSubagent({ chatId, agentKey }: { chatId: number; agentKey: string }) {
  const { chat, project, error, ready } = useOpenChat(chatId, true);
  if (error) return <div className="page error">{error}</div>;
  if (!ready || !chat) return <div className="page muted">読み込み中…</div>;
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
  // 開いたときの名前は、押したときの一覧から引く
  const viewRef = useLatest(view);
  const pane = useMemo<ChatPaneActions>(() => {
    const base = shell.pane;
    const openScreen = (key: string) => {
      const entry = viewRef.current.subagentsView?.tree.byKey.get(key);
      openPopout({ kind: "subagent", chatId: chat.id, agentKey: key }, `${entry?.description ?? "サブエージェント"} — サブエージェント`);
    };
    const reveal = (eventId: number | undefined, agent: string | null) => postToMainWindow("reveal", { chatId: chat.id, eventId, agent });
    return {
      ...base,
      openSubagentSide: (key) => openScreen(key),
      openSubagentWindow: (key) => openScreen(key),
      openSubagent: (key) => openScreen(key),
      revealSubagent: (key, inside) => reveal(inside, key),
      revealInConversation: reveal,
      focusActivity: (key) => postToMainWindow("showActivity", { chatId: chat.id, agent: key }),
      fillComposer: (text) => postToMainWindow("fillComposer", { chatId: chat.id, text }),
    };
    // チャットの画面の操作はチャットごとに 1 回だけ作る（shell.pane と同じ）
  }, [shell.pane, chat.id, viewRef]);
  const links = usePopoutFileLinks(fileLinks, { chatId: chat.id, projectId: chat.project_id, worktree: chat.worktree_path ?? undefined });
  return (
    // チャットの AI（ツールの行の文・使用状況など。右の欄のサブエージェントの画面と同じく、そのチャットの AI で出す）
    <ChatProviderContext.Provider value={chat.provider}>
      <FileLinksProvider value={links}>
        {/* 作業場所を移す前の行は、そのときの作業場所の別ウィンドウで開く */}
        <PastWorkplacesProvider chatId={chat.id} current={links} side={false} adapt={(l, place) => popoutFileLinks(l, { chatId: chat.id, ...place })}>
          <ChatImagesProvider chatId={chat.id}>
            <ChatPaneContext.Provider value={pane}>
              <div className="popout-body">
                <SubagentScreen chatId={chat.id} agentKey={agentKey} />
              </div>
            </ChatPaneContext.Provider>
          </ChatImagesProvider>
        </PastWorkplacesProvider>
      </FileLinksProvider>
    </ChatProviderContext.Provider>
  );
}
