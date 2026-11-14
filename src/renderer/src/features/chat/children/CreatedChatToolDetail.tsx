import { MessagesSquare } from "lucide-react";
import { createdChatIdOf } from "@shared/chat/aiCreateChat";
import { useKnownChat } from "@/stores/chats";
import { chatTitle } from "@/features/chat/chatTitle";
import { openChatOrChild } from "./openChild";

/**
 * チャットのツールの行を開いた中身（AI がチャットを作るツール create_chat と、前の版の create_child_chat）: 送った依頼の全文と、
 * 作れていれば作ったチャットの札（名前。押すと、子・兄弟チャットは設定の開き方で、親のないチャットはチャットのパネルで開く）。
 * 結果の文はツールの行がこの下に出す
 */
export function CreatedChatToolDetail({ text, result }: { text: string; result: string | undefined }) {
  const chatId = result ? createdChatIdOf(result) : null;
  const chat = useKnownChat(chatId ?? 0);
  const kind = chat?.parent_chat_id === null ? "チャット" : "子チャット";
  return (
    <>
      <pre className="tool-output">{text}</pre>
      {chatId !== null && (
        <div className="tool-actions">
          <button
            type="button"
            className="btn btn-sm"
            disabled={!chat}
            title={chat ? `${kind}「${chatTitle(chat.title)}」を開く` : "チャットが見つかりません（消されたか、まだ一覧に届いていません）"}
            onClick={() => chat && openChatOrChild(chat)}
          >
            <MessagesSquare size={13} aria-hidden /> {chat ? `「${chatTitle(chat.title)}」を開く` : "チャットを開く"}
          </button>
        </div>
      )}
    </>
  );
}
