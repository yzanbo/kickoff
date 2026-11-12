import { MessagesSquare } from "lucide-react";
import { childChatIdOf } from "@shared/chat/aiChildChat";
import { useKnownChat } from "@/stores/chats";
import { chatTitle } from "@/features/chat/chatTitle";
import { openChildChat } from "./openChild";

/**
 * チャットのツールの行を開いた中身（AI が自分の子チャットを作るツール create_child_chat）: 子チャットに送った依頼の全文と、
 * 作れていれば「子チャットを開く」（設定の開き方で開く）。結果の文はツールの行がこの下に出す
 */
export function ChildChatToolDetail({ text, result }: { text: string; result: string | undefined }) {
  const childId = result ? childChatIdOf(result) : null;
  const child = useKnownChat(childId ?? 0);
  return (
    <>
      <pre className="tool-output">{text}</pre>
      {childId !== null && (
        <div className="tool-actions">
          <button
            type="button"
            className="btn btn-sm"
            disabled={!child}
            title={child ? `子チャット「${chatTitle(child.title)}」を開く` : "子チャットが見つかりません（消されたか、まだ一覧に届いていません）"}
            onClick={() => child && openChildChat(child)}
          >
            <MessagesSquare size={13} aria-hidden /> 子チャットを開く
          </button>
        </div>
      )}
    </>
  );
}
