import { ArrowUp, MessagesSquare } from "lucide-react";
import { useState } from "react";
import type { AgentState, Chat } from "@shared/types";
import { api } from "@/api";
import { useChatStates } from "@/app/chatStatesContext";
import { useOptionalSetting } from "@/hooks/useSetting";
import { isSubmitKey } from "@/lib/keys";
import { chatDraft } from "@/lib/storageKeys";
import { addChat, useMemoChatOf } from "@/stores/chats";
import { reportFailure } from "@/ui/dialogs";
import { IconButton } from "@/ui/IconButton";
import { useQueueMode } from "@/features/chat/composer/QueueModeToggle";
import { StatusSlot } from "@/features/chat/StatusSlot";

/** メモのチャットの様子の文（既読は出さない） */
const STATUS_TEXTS: Record<Exclude<AgentState, "read">, string> = {
  running: "AI が作業しています…",
  needs_input: "AI が回答を待っています",
  failed: "エラーで止まりました",
  unread: "終わりました（返事は会話で）",
};

/**
 * メモのページの下の、そのメモを AI に直してもらう入力欄（メモのチャットの欄を閉じている間だけ出す）。
 * 送る先はメモのチャット（まだなければ作る）で、AI がファイルを書き換えると、ページ・本文はメモの変更の知らせで読み直す。
 * 会話は出さず、作業中・回答待ちなどの様子の 1 行と「会話を開く」（メモのチャットの欄を開く）だけ。
 * 書きかけの文はメモのチャットの入力欄と共有する（chatDraft）。送る前に書きかけの本文を保存する（beforeSend。保存できなければ送らない）
 */
export function MemoQuickChat({
  projectId,
  path,
  beforeSend,
  onOpenChat,
}: {
  projectId: number;
  path: string;
  beforeSend: () => Promise<void>;
  onOpenChat: () => void;
}) {
  const chat = useMemoChatOf(projectId, path);
  const { stateOf } = useChatStates();
  const [queueMode] = useQueueMode();
  const [text, setText] = useOptionalSetting(chat ? chatDraft(chat.id) : undefined, "");
  const [sending, setSending] = useState(false);
  const state = chat ? stateOf(chat) : "read";

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await beforeSend();
      await sendToMemoChat(projectId, path, chat, body, queueMode);
      setText("");
    } catch (e) {
      reportFailure("メモのチャットに送れませんでした")(e);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="memo-quick-chat">
      {state !== "read" && (
        <div className="memo-quick-status" role="status">
          <StatusSlot state={state} />
          <span className="memo-quick-status-text">{STATUS_TEXTS[state]}</span>
          <button type="button" className="link-button" onClick={onOpenChat}>
            会話を開く
          </button>
        </div>
      )}
      <div className="memo-quick-box">
        <textarea
          className="memo-quick-input"
          rows={1}
          value={text}
          placeholder="このページの直し方を AI に頼む（例: 表を日付順に / 見出しの色を青に）。Enter で送る"
          aria-label="このメモを AI に直してもらう"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (!isSubmitKey(e)) return;
            e.preventDefault();
            void send();
          }}
        />
        <IconButton icon={MessagesSquare} label="会話を開く" title="メモのチャットの欄を開く（これまでのやり取りを見る・モデルを選ぶ・添付する）" onClick={onOpenChat} />
        <IconButton icon={ArrowUp} label="送る" keys="Enter" className="memo-quick-send" disabled={!text.trim() || sending} onClick={() => void send()} />
      </div>
    </div>
  );
}

/**
 * メモのチャットに送る（まだなければ作る。作業中なら、チャット欄の切り替えに合わせて いま = 止めずに伝える / あとで = 送信待ちに足す）。
 * モデルなどの選択はそのチャットのもの（新しく作るときはプロジェクト・設定の既定）
 */
async function sendToMemoChat(projectId: number, path: string, chat: Chat | undefined, text: string, mode: "queue" | "tell"): Promise<void> {
  if (!chat) {
    // 一覧の知らせを待たずに入れる（様子の行・チャットの欄がすぐこのチャットを指すように）
    addChat(await api.startMemoChat(projectId, { path, text }));
    return;
  }
  if (chat.status !== "running") addChat(await api.sendMessage(chat.id, text, {}));
  else if (mode === "tell") await api.tellChat(chat.id, text, {}, []);
  else await api.queueMessage(chat.id, text, {}, []);
}
