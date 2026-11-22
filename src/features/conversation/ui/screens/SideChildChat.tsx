import { useEffect, useEffectEvent } from "react";
import { ChatScreen } from "@/features/conversation/ui/screen/ChatScreen";
import { useChatOf, useMainChat } from "@/features/chat/ui";
import { useTabPage } from "@/features/panel/ui";
import { ChildChatBar } from "@/features/childChats/ui/ChildChatBar";

/**
 * チャットの画面の右の欄に開いた子チャット: 上の帯（親を見る・親チャットに渡す）と、ふつうのチャットの画面（ChatScreen）。
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
  const chat = useChatOf(chatId);
  const title = chat?.title;
  // 足す先は、この右の欄を持つチャット（外の MainChatContext）
  const mainChatId = useMainChat();
  const tabPage = useTabPage();
  // タブの名前を最新に（名前の自動生成・変更。渡される関数は描くたびに変わるので、名前が変わったときだけ呼ぶ）
  const setTitle = useEffectEvent(onTitle);
  useEffect(() => {
    if (title !== undefined) setTitle(title);
  }, [title]);
  return (
    <ChatScreen
      chatId={chatId}
      visible={visible}
      host={{ surface: "side", pausable: true, side: null, slot, bringToFront: tabPage?.show, mainChatId }}
      frame={(current, screen) => (
        <div className="side-child-chat">
          <ChildChatBar chat={current} />
          <div className="side-child-chat-body">
            {screen}
          </div>
        </div>
      )}
    />
  );
}
