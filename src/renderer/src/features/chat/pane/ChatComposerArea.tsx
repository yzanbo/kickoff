import { TriangleAlert } from "lucide-react";
import type { MutableRefObject } from "react";
import type { Chat, ChatEvent, ChatLive } from "@shared/types";
import type { SubagentEntry } from "@shared/chat/subagents";
import { chatDraft } from "@/lib/storageKeys";
import { useBusyNeighbors } from "@/features/worktree/useBusyNeighbors";
import { Composer } from "@/features/chat/composer/Composer";
import type { ComposerHandle } from "@/features/chat/composer/composerHandle";
import { ContextMeter } from "@/features/chat/composer/ContextMeter";
import { QueueModeToggle } from "@/features/chat/composer/QueueModeToggle";
import type { ChatOptionsState } from "@/features/chat/options/ChatOptionsBar";
import type { PromptList } from "@/features/chat/prompts/promptHistory";
import { PromptsChip } from "@/features/chat/prompts/PromptsChip";
import { QueuedMessages } from "@/features/chat/queue/QueuedMessages";
import { TodoChip } from "@/features/chat/status/TodoChip";
import { SubagentChip } from "@/features/chat/subagents/Subagents";
import type { useChatSend } from "./useChatSend";

/**
 * チャット欄の場所（流れの下）: 同じ作業場所で作業中のほかのチャットの知らせ → チャットの情報のピル（指示の履歴・ToDo・サブエージェント・一番下へ戻るボタンの置き場所）→
 * 送信待ち（次に送るもの）→ 入力欄（いま書いているもの）
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
        <TodoChip events={events} />
        <SubagentChip entries={subagents} chat={chat} busy={busy} models={options.models} />
        {/* 上を読んでいる間の一番下へ戻るボタンの置き場所（右端。入る幅があるときだけ流れの側から置く） */}
        <span ref={onDock} className="composer-chips-dock" />
      </div>
      {/* 送信待ちの指示は入力欄のすぐ上（流れ → チャットの情報 → 次に送るもの → いま書いているもの の順） */}
      <QueuedMessages queue={live.queue} busy={busy} />
      <Composer
        chatContext={{ projectId: chat.project_id, exclude: chat.id }}
        options={options}
        busy={busy}
        queueWhileIdle={!busy && queued}
        placeholder={send.placeholder}
        sendLabel={send.sendLabel}
        onSend={send.onSend}
        onQueue={send.onQueue}
        busyControls={<QueueModeToggle busy={busy} value={send.queueMode} onChange={send.setQueueMode} />}
        stopping={live.stopping}
        onStop={send.onStop}
        trailing={<ContextMeter chat={chat} compacting={live.compacting !== null} />}
        suggestTarget={{ projectId: chat.project_id, worktree: chat.worktree_path ?? undefined }}
        handleRef={composer}
        history={prompts.recalls}
        draft={chatDraft(chat.id)}
      />
    </div>
  );
}
