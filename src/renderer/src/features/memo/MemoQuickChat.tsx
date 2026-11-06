import { useEffect, useRef, useState } from "react";
import type { AgentState, Attachment, Chat } from "@shared/types";
import { api } from "@/api";
import { useChatStates } from "@/app/chatStatesContext";
import { chatDraft } from "@/lib/storageKeys";
import { addChat, useMemoChatOf } from "@/stores/chats";
import { Composer } from "@/features/chat/composer/Composer";
import type { ComposerHandle } from "@/features/chat/composer/composerHandle";
import { ContextMeter } from "@/features/chat/composer/ContextMeter";
import { QueueModeToggle } from "@/features/chat/composer/QueueModeToggle";
import { useChatOptions } from "@/features/chat/options/ChatOptionsBar";
import { useChatSend } from "@/features/chat/pane/useChatSend";
import type { TimelineScroll } from "@/features/chat/timeline/timelineScroll";
import { StatusSlot } from "@/features/chat/StatusSlot";
import { SnippetBar } from "@/features/snippet/SnippetBar";

/** メモのチャットの様子の文（既読は出さない） */
const STATUS_TEXTS: Record<Exclude<AgentState, "read">, string> = {
  running: "AI が作業しています…",
  needs_input: "AI が回答を待っています",
  failed: "エラーで止まりました",
  unread: "終わりました（返事は会話で）",
};

/** ふだんの入力欄の案内（作業中は、チャット欄と同じく送り方の案内にする） */
const PLACEHOLDER = "このページの直し方を AI に頼む（例: 表を日付順に / 見出しの色を青に）。Enter で送る、Shift+Enter で改行";

/** 流れを持たないので、送っても付いていくものがない（useChatSend に渡すスクロールの代わり） */
const NO_SCROLL: TimelineScroll = { ref: { current: null }, following: () => false, follow: () => {}, release: () => {} };

/**
 * メモのページの下の、そのメモを AI に直してもらう入力欄（メモのチャットの欄を閉じている間だけ出す）。
 * 入力欄はチャット欄と同じ Composer（定型文の帯・添付・ほかのチャットの参照・音声入力・モデルなどの選択・メーター・送信と ▾）で、
 * 送る先はメモのチャット（まだなければ作る）。AI がファイルを書き換えると、ページ・本文はメモの変更の知らせで読み直す。
 * 会話は出さず、上に作業中・回答待ちなどの様子と「会話を開く」（メモのチャットの欄を開く）の 1 行だけ。
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
  const state = chat ? stateOf(chat) : "read";
  return (
    <div className="memo-quick-chat">
      <div className="memo-quick-status" role="status">
        {state !== "read" && (
          <>
            <StatusSlot state={state} />
            <span className="memo-quick-status-text">{STATUS_TEXTS[state]}</span>
          </>
        )}
        <button type="button" className="link-button" title="メモのチャットの欄を開く（これまでのやり取りを見る）" onClick={onOpenChat}>
          会話を開く
        </button>
      </div>
      {/* チャットができたら選択（モデルなど）をそのチャットのものから始め直す */}
      <MemoQuickComposer key={chat?.id ?? "new"} projectId={projectId} path={path} chat={chat} beforeSend={beforeSend} />
    </div>
  );
}

/**
 * メモのチャットに送る入力欄。チャットがあれば送り方はチャットの画面と同じ（useChatSend。作業中はチャット欄の切り替えの いま / あとで、
 * 送信の ▾ の「質問として送る」、中断）。まだなければ、送るとメモのチャットを作る（作業中にはならないので、送り方の切り替えも ▾ も出さない）
 */
function MemoQuickComposer({ projectId, path, chat, beforeSend }: { projectId: number; path: string; chat: Chat | undefined; beforeSend: () => Promise<void> }) {
  const options = useChatOptions(
    chat ? { model: chat.model, effort: chat.effort, permission_mode: chat.permission_mode, fast_mode: chat.fast_mode } : undefined,
    projectId,
    chat?.worktree_path ?? undefined,
  );
  const composer = useRef<ComposerHandle | null>(null);
  const busy = chat?.status === "running";
  // 停止を押して、止まるのを待っている（止まったら戻す）
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    if (!busy) setStopping(false);
  }, [busy]);
  const send = useChatSend({
    chatId: chat?.id ?? 0,
    busy,
    // 送信待ち・裏の作業・圧縮中の様子は読まない（会話の欄を開けば分かる。作業していなければ、送るとすぐ送る）
    queued: false,
    compacting: false,
    options,
    scroll: NO_SCROLL,
    background: null,
    runningAgents: 0,
    onStopping: setStopping,
    beforeSend,
  });
  // まだチャットがなければ、送るとメモのチャットを作る（一覧の知らせを待たずに入れ、様子の行・チャットの欄がすぐこのチャットを指すように）
  const onSend = chat
    ? send.onSend
    : async (text: string, attachments: Attachment[]) => {
        await beforeSend();
        addChat(await api.startMemoChat(projectId, { path, text, options: options.options, attachments }));
      };
  return (
    <div className="chat-composer">
      <Composer
        chatContext={{ projectId, exclude: chat?.id }}
        options={options}
        busy={busy}
        placeholder={busy ? send.placeholder : PLACEHOLDER}
        sendLabel={busy ? send.sendLabel : undefined}
        onSend={onSend}
        onQueue={send.onQueue}
        busyControls={<QueueModeToggle busy={busy} value={send.queueMode} onChange={send.setQueueMode} />}
        stopping={stopping}
        onStop={chat ? send.onStop : undefined}
        trailing={chat && <ContextMeter chat={chat} compacting={null} reserved={null} />}
        header={<SnippetBar projectId={projectId} composer={composer} onSend={(text) => (busy ? send.onQueue(text, []) : onSend(text, []))} />}
        suggestTarget={{ projectId, worktree: chat?.worktree_path ?? undefined }}
        handleRef={composer}
        draft={chat ? chatDraft(chat.id) : undefined}
        sendTo={chat ? [{ label: "質問として送る（答えのあとで一時停止）", onSend: send.onAsk }] : undefined}
      />
    </div>
  );
}
