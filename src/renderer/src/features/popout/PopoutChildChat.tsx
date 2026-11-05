import { ArrowUpLeft, Minus, Send } from "lucide-react";
import { useEffect, useRef } from "react";
import { postToMainWindow } from "@/app/windowBus";
import { chatTitle } from "@/features/chat/chatTitle";
import { closeChatWithChoice } from "@/features/chat/closeChat";
import { handBackText } from "@/features/chat/children/childChats";
import { ChatView } from "@/features/chat/pane/ChatPane";
import { useChatDetail } from "@/features/chat/pane/useChatDetail";
import { reportFailure } from "@/ui/dialogs";

/**
 * 子チャットの別ウィンドウ: ふつうのチャットの画面（ChatView）に、上の帯（親へ戻る・メインに渡す・しまう）を足す。
 * 「しまう」と最小化（メインプロセスが閉じる）は、閉じ方を聞かずにウィンドウを閉じる（子チャットは残り、親の会話の札から開き直せる）。
 * ✕・⌘W は、チャットの ✕ と同じく閉じ方（表示だけ消す = しまう / アーカイブ / 削除）を聞く（既定は設定の「チャット」）
 */
export function PopoutChildChat({ chatId }: { chatId: number }) {
  const { chat, project, events, approvals, live, streaming, error } = useChatDetail(chatId);
  // 閉じ方を聞いている間に、もう一度 ✕ を押されても重ねて聞かない
  const asking = useRef(false);
  const chatRef = useRef(chat);
  chatRef.current = chat;
  // 閉じ方を聞かずに閉じる（メインプロセスに頼む。デスクトップアプリでなければ、ふつうに閉じる）
  const closeWindow = () => void (window.kickoff ? window.kickoff.windows.closeSelf() : window.close());
  // ✕・⌘W はメインプロセスが止めて知らせてくる。閉じ方を聞いてから閉じる（チャットが消えていれば、そのまま閉じる）
  useEffect(
    () =>
      window.kickoff?.windows.onCloseRequested(() => {
        const current = chatRef.current;
        if (!current) return closeWindow();
        if (asking.current) return;
        asking.current = true;
        closeChatWithChoice(current, closeWindow)
          .catch(reportFailure("閉じられませんでした"))
          .finally(() => (asking.current = false));
      }),
    [],
  );

  if (error) return <div className="page error">{error}</div>;
  if (!chat) return <div className="page muted">読み込み中…</div>;
  const parentId = chat.parent_chat_id;
  // いちばん新しいメインの AI の返答（サブエージェントの文は除く）
  const answer = [...events].reverse().find((e) => e.type === "text" && !e.data.parent);
  const answerText = answer?.type === "text" ? answer.data.text : "";
  return (
    <>
      <div className="child-chat-bar">
        <span className="child-chat-bar-label">子チャット</span>
        <span className="child-chat-bar-title">{chatTitle(chat.title)}</span>
        <span className="spacer" />
        {parentId !== null && (
          <>
            <button
              type="button"
              className="btn btn-sm"
              title="親のチャットの、聞いた位置を見る（メインのウィンドウ）"
              onClick={() => postToMainWindow({ type: "reveal", chatId: parentId, eventId: chat.parent_event_id ?? undefined, agent: null })}
            >
              <ArrowUpLeft size={13} aria-hidden /> 親を見る
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={!answerText}
              title="いちばん新しい答えを、引用として親のチャットの入力欄に入れる（送るのは自分で）"
              onClick={() => postToMainWindow({ type: "fillComposer", chatId: parentId, text: handBackText(chat, answerText) })}
            >
              <Send size={13} aria-hidden /> メインに渡す
            </button>
          </>
        )}
        <button type="button" className="btn btn-sm" title="ウィンドウを閉じる（子チャットは残り、親の会話の札から開き直せる。最小化でも同じ）" onClick={closeWindow}>
          <Minus size={13} aria-hidden /> しまう
        </button>
      </div>
      <div className="popout-body">
        <ChatView key={chat.id} chat={chat} project={project} events={events} approvals={approvals} live={live} streaming={streaming} visible />
      </div>
    </>
  );
}
