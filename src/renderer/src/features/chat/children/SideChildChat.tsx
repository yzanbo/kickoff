import { useEffect, useRef } from "react";
import { ChatView } from "@/features/chat/pane/ChatPane";
import { useChatDetail } from "@/features/chat/pane/useChatDetail";
import { PanelHostContext } from "@/features/panel/panelHost";
import { ChildChatBar } from "./ChildChatBar";

/**
 * チャットの画面の右の欄に開いた子チャット: 上の帯（親を見る・親チャットに渡す）と、ふつうのチャットの画面（ChatView）。
 * 子チャットの画面の中には右の欄を置かない（右の欄の中に右の欄を重ねない。子のサブエージェントは流れの中、ファイルはファイルタブで開く）
 */
export function SideChildChat({
  chatId,
  visible,
  onTitle,
  slot,
}: {
  chatId: number;
  visible: boolean;
  onTitle: (title: string) => void;
  /** パネルのタブの置き場所（chatPaneSlot。タブの右クリックから会話 / 動きを切り替える） */
  slot?: string;
}) {
  const { chat, project, events, approvals, live, streaming, error } = useChatDetail(chatId);
  const title = chat?.title;
  // タブの名前を最新に（名前の自動生成・変更。渡される関数は描くたびに変わるので、名前が変わったときだけ呼ぶ）
  const setTitle = useRef(onTitle);
  setTitle.current = onTitle;
  useEffect(() => {
    if (title !== undefined) setTitle.current(title);
  }, [title]);
  if (error) return <div className="page error">{error}</div>;
  if (!chat) return <div className="page muted">読み込み中…</div>;
  return (
    <div className="side-child-chat">
      <ChildChatBar chat={chat} events={events} />
      <div className="side-child-chat-body">
        <PanelHostContext.Provider value={null}>
          <ChatView key={chat.id} chat={chat} project={project} events={events} approvals={approvals} live={live} streaming={streaming} visible={visible} slot={slot} />
        </PanelHostContext.Provider>
      </div>
    </div>
  );
}
