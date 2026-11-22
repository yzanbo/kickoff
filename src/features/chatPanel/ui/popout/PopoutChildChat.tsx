import { useEffect, useEffectEvent, useRef } from "react";
import { closeChatWithChoice } from "@/features/chat/ui/closeChat";
import { ChildChatBar } from "@/features/childChats/ui/ChildChatBar";
import { PopoutDockButton } from "@/foundation/ui/navigation/PopoutDockButton";
import { ChatScreen } from "@/features/conversation/ui/screen/ChatScreen";
import { useChatOf, rootChatOf, knownChat } from "@/features/chat/ui";
import { SideScope } from "@/features/conversation/ui/SideScope";
import { reportFailure } from "@/foundation/ui/kit/ask";

/**
 * 子チャットの別ウィンドウ: ふつうのチャットの画面（ChatScreen）に、上の帯（親を見る・親チャットに渡す・右の欄に戻す）を足す。
 * 最小化（メインプロセスが閉じる）は、閉じ方を聞かずにウィンドウを閉じる（子チャットは残り、親の会話の札から開き直せる）。
 * ✕・⌘W は、チャットの ✕ と同じく閉じ方（表示だけ消す / アーカイブ / 削除）を聞く（既定は設定の「チャット」）。
 * 「メインのチャット」（右クリックの組・選んだときの「メインに追加」）は、右の欄に開いたときと同じく、いちばん上の親
 */
export function PopoutChildChat({ chatId }: { chatId: number }) {
  const chat = useChatOf(chatId);
  // 閉じ方を聞いている間に、もう一度 ✕ を押されても重ねて聞かない
  const asking = useRef(false);
  // 閉じ方を聞かずに閉じる（メインプロセスに頼む。デスクトップアプリでなければ、ふつうに閉じる）
  const closeWindow = () => void (window.kickoff ? window.kickoff.windows.closeSelf() : window.close());
  // ✕・⌘W はメインプロセスが止めて知らせてくる。閉じ方を聞いてから閉じる（チャットが消えていれば、そのまま閉じる）
  const onCloseRequested = useEffectEvent(() => {
    if (!chat) return closeWindow();
    if (asking.current) return;
    asking.current = true;
    closeChatWithChoice(chat, closeWindow)
      .catch(reportFailure("閉じられませんでした"))
      .finally(() => (asking.current = false));
  });
  useEffect(() => window.kickoff?.windows.onCloseRequested(() => onCloseRequested()), []);

  // いちばん上の親（一覧をまだ読んでいなければ、すぐ上の親）
  const root = chat ? rootChatOf(chat, knownChat) : null;
  const mainChatId = chat && root ? (root.id !== chat.id ? root.id : chat.parent_chat_id) : null;
  return (
    <ChatScreen
      chatId={chatId}
      visible
      host={{ surface: "window", pausable: false, side: null, mainChatId }}
      frame={(current, screen) => (
        <SideScope mainChatId={mainChatId}>
          <ChildChatBar chat={current} extra={<PopoutDockButton route={{ kind: "chat", chatId }} />} />
          <div className="popout-body">{screen}</div>
        </SideScope>
      )}
    />
  );
}
