import { TriangleAlert } from "lucide-react";
import type { MutableRefObject } from "react";
import type { Attachment, Chat, ChatEvent, ChatLive } from "@shared/types";
import type { SubagentEntry } from "@shared/chat/subagents";
import { api } from "@/api";
import { chatDraft } from "@/lib/storageKeys";
import { useBusyNeighbors } from "@/features/worktree/useBusyNeighbors";
import { Composer } from "@/features/chat/composer/Composer";
import type { ComposerHandle } from "@/features/chat/composer/composerHandle";
import { ContextMeter } from "@/features/chat/composer/ContextMeter";
import { reservedCompact } from "@/features/chat/queue/queuedHint";
import { QueueModeToggle } from "@/features/chat/composer/QueueModeToggle";
import type { ChatOptionsState } from "@/features/chat/options/ChatOptionsBar";
import type { PromptList } from "@/features/chat/prompts/promptHistory";
import { PromptsChip } from "@/features/chat/prompts/PromptsChip";
import { QueuedMessages } from "@/features/chat/queue/QueuedMessages";
import { TodoChip } from "@/features/chat/status/TodoChip";
import { ChildChatsChip } from "@/features/chat/children/ChildChatChips";
import { openCreatedChild } from "@/features/chat/children/openChild";
import { MemoChip } from "@/features/memo/MemoChip";
import { SubagentChip } from "@/features/chat/subagents/SubagentChip";
import { SnippetBar } from "@/features/snippet/SnippetBar";
import type { useChatSend } from "./useChatSend";

/** 「質問として送る」の説明 */
const ASK_SEND_TITLE =
  "いまの送り方で送り、この指示の作業が終わったら、送信待ちを自動で送らずに一時停止します（答えを見てから次を決めるとき。送信待ちに入れたときは、その指示のすぐあとに一時停止を挟みます）";

/** 「子チャットに送る」の説明 */
const CHILD_SEND_TITLE = "この文を、このチャットの会話を引き継いだ子チャットで送ります（このチャットの作業は止めません。作った子チャットは設定の「子チャットを作ったとき」で開き、上のピルの子チャットにも並びます）";

/**
 * チャット欄の場所（流れの下）: 同じ作業場所で作業中のほかのチャットの知らせ → チャットの情報のピル（指示の履歴・ToDo・サブエージェント・一番下へ戻るボタンの置き場所）→
 * 定型文の帯 → 送信待ち（次に送るもの）→ 入力欄（いま書いているもの）
 */
export function ChatComposerArea({
  chat,
  events,
  prompts,
  live,
  busy,
  options,
  subagents,
  send,
  composer,
  onDock,
}: {
  chat: Chat;
  events: ChatEvent[];
  prompts: PromptList;
  live: ChatLive;
  busy: boolean;
  options: ChatOptionsState;
  subagents: SubagentEntry[];
  send: ReturnType<typeof useChatSend>;
  /** 外からチャット欄を動かす口（チャットの画面の操作が使う） */
  composer: MutableRefObject<ComposerHandle | null>;
  /** 一番下へ戻るボタンの置き場所（ピルの列の右端。描いたら要素が届き、流れの側で置けるか測る） */
  onDock: (dock: HTMLSpanElement | null) => void;
}) {
  const busyNeighbors = useBusyNeighbors(chat.project_id, chat.worktree_path, chat.id);
  const queued = live.queue.messages.length > 0;
  // 送信ボタンの右クリック:
  // 「質問として送る」: いまの送り方で送り、その指示の作業が終わったら送信待ちを一時停止する（答えを見て次を決める）
  // 「子チャットに送る」: この文と添付で、このチャットの会話を引き継いだ子チャットを作って送る（このチャットの作業は止めない。
  // 作った子チャットは設定の「子チャットを作ったとき」で開く。上のピルの子チャットにも並ぶ）。メモのチャット・アーカイブ済みでは出さない
  const memoOrArchived = Boolean(chat.memo_path) || chat.archived_at !== null;
  const sendToChild = async (text: string, attachments: Attachment[]) => {
    openCreatedChild(await api.createChildChat(chat.id, { text, attachments, quote: null, inherit: true, event_id: null, options: options.options }));
  };
  // 定型文の帯の「すぐ送る」: 入力欄の文はそのままにして、定型文だけを送る（作業中・送信待ちがあれば、入力欄から送るのと同じく送信待ちの送り方に従う）
  const sendSnippet = (text: string) => (busy || queued ? send.onQueue(text, []) : send.onSend(text, []));
  return (
    <div className="chat-composer">
      {/*
        同じ作業場所で、ほかのチャットも作業中なら知らせる（同じファイルを触るとぶつかる）。押して開くピルの列とは役割が違うので、
        ピルに混ぜず、その上の 1 行に分ける（以前はピルの横に並べていて、ピルの一つに見えた・狭いと折り返してピルの間に入った）
      */}
      {busyNeighbors > 0 && (
        <p className="composer-notice small warn-text">
          <TriangleAlert size={13} aria-hidden />
          <span>この作業場所では、ほかのチャット {busyNeighbors} 件も作業中です。同じファイルを触ると作業がぶつかることがあります。</span>
        </p>
      )}
      {/* チャット欄のすぐ上に、このチャットのサブエージェントなどをピルで並べる */}
      <div className="composer-chips">
        <PromptsChip prompts={prompts.entries} />
        <TodoChip chatId={chat.id} events={events} />
        <SubagentChip entries={subagents} chat={chat} busy={busy} models={options.models} />
        <ChildChatsChip chatId={chat.id} />
        <MemoChip projectId={chat.project_id} chatId={chat.id} />
        {/* 上を読んでいる間の一番下へ戻るボタンの置き場所（右端。入る幅があるときだけ流れの側から置く） */}
        <span ref={onDock} className="composer-chips-dock" />
      </div>
      {/* 送信待ちの指示は入力欄のすぐ上（流れ → チャットの情報 → 次に送るもの → いま書いているもの の順） */}
      <QueuedMessages queue={live.queue} busy={busy} childChats={!memoOrArchived} />
      <Composer
        chatContext={{ projectId: chat.project_id, exclude: chat.id }}
        options={options}
        busy={busy}
        queueWhileIdle={!busy && queued}
        // 会話の圧縮中は、右下をふだんの見た目にする（送った文は圧縮が終わってから伝わる）
        plainActions={live.compacting !== null}
        placeholder={send.placeholder}
        sendLabel={send.sendLabel}
        onSend={send.onSend}
        onQueue={send.onQueue}
        busyControls={<QueueModeToggle busy={busy} value={send.queueMode} onChange={send.setQueueMode} />}
        stopping={live.stopping}
        onStop={send.onStop}
        trailing={<ContextMeter chat={chat} compacting={live.compacting} reserved={reservedCompact(live.queue)} />}
        // よく送る指示（このプロジェクトで使う定型文）。入力欄の枠の中の上（送信待ちとの区切り線の下）に置き、押すと入力欄に入れる
        header={<SnippetBar projectId={chat.project_id} composer={composer} onSend={sendSnippet} />}
        suggestTarget={{ projectId: chat.project_id, worktree: chat.worktree_path ?? undefined }}
        handleRef={composer}
        history={prompts.recalls}
        draft={chatDraft(chat.id)}
        sendTo={[
          { label: "質問として送る（答えのあとで一時停止）", title: ASK_SEND_TITLE, onSend: send.onAsk },
          ...(memoOrArchived ? [] : [{ label: "子チャットに送る", title: CHILD_SEND_TITLE, onSend: sendToChild }]),
        ]}
      />
    </div>
  );
}
