import { Maximize2, MessageSquare, OctagonPause } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AgentState, Attachment, Chat } from "@shared/types";
import { api } from "@/api";
import { useChatStates } from "@/app/chatStatesContext";
import { chatAttachmentsDraft, chatDraft } from "@/lib/storageKeys";
import { settingAttachmentDraft } from "@/features/chat/attachments/useComposerFiles";
import { addChat, useMemoChatOf } from "@/stores/chats";
import { Composer } from "@/features/chat/composer/Composer";
import type { ComposerHandle } from "@/features/chat/composer/composerHandle";
import { ContextMeter } from "@/features/chat/composer/ContextMeter";
import { QueueModeToggle } from "@/features/chat/composer/QueueModeToggle";
import { useChatOptions } from "@/features/chat/options/ChatOptionsBar";
import { useChatSend } from "@/features/chat/pane/useChatSend";
import type { TimelineScroll } from "@/features/chat/timeline/timelineScroll";
import { StatusSlot } from "@/features/chat/StatusSlot";
import { SnippetBar, SnippetBarToggleItem } from "@/features/snippet/SnippetBar";
import { useWideText } from "@/features/chat/pane/TextWidthToggle";
import { cx } from "@/lib/cx";
import { useOverflowLevel } from "@/hooks/useOverflowCompact";
import { CloseButton, IconButton } from "@/ui/IconButton";

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
 * 会話は出さず、入力欄の上は 1 行だけ: 左から名前「メモのチャット」（欄の見出しと同じアイコンと色。本文の右クリックの「メモのチャット」の組・
 * 選んだときの「メモのチャットに追加」の行き先がこの欄だと分かるように）・メモのチャットを開いたときと同じピルの列（指示の履歴・ToDo・
 * サブエージェント・子チャット・メモ。閉じている欄の中のチャットの画面が chipsPortal でここに描く。指示へ移る・サブエージェントを開くなどは、欄を開いてから）・
 * 作業中・回答待ちなどの様子・右端に「会話を開く」（メモのチャットの欄を開く）・「非表示にする」（×）。
 * 入力欄のすぐ上に送信待ち（利用者の依頼。閉じている欄の中のチャットの画面が chipsPortal の queueTarget に描く。並べ替え・書き直し・すぐ送るなどもそのまま）。
 * 送信待ちがあれば（queued）、チャット欄と同じく、作業していなくても送るものを送信待ちに足す。
 * 書きかけの文はメモのチャットの入力欄と共有する（chatDraft）。送る前に書きかけの本文を保存する（beforeSend。保存できなければ送らない）
 */
export function MemoQuickChat({
  projectId,
  path,
  beforeSend,
  onOpenChat,
  onHide,
  chipsRef,
  queueRef,
  queued,
}: {
  projectId: number;
  path: string;
  beforeSend: () => Promise<void>;
  onOpenChat: () => void;
  /** 非表示にする（この入力欄も隠し、メモだけを広く見る。見出しの吹き出しでいつでも開ける） */
  onHide: () => void;
  /** 名前の横の、メモのチャットのピルの列を描いてもらう場所（メモのチャットの画面が chipsPortal で描く） */
  chipsRef: (el: HTMLDivElement | null) => void;
  /** 入力欄のすぐ上の、メモのチャットの送信待ちを描いてもらう場所（メモのチャットの画面が chipsPortal で描く） */
  queueRef: (el: HTMLDivElement | null) => void;
  /** メモのチャットに送信待ちがある */
  queued: boolean;
}) {
  const chat = useMemoChatOf(projectId, path);
  const { stateOf } = useChatStates();
  const state = chat ? stateOf(chat) : "read";
  // 幅はメモのチャットの欄（チャットの画面）と同じ「会話の横幅」に従う（標準なら上限 820px で真ん中、広げるなら幅いっぱい。開け閉めで幅が変わらないように）
  const [wide] = useWideText();
  const fit = useQuickStatusFit();
  return (
    <div className={cx("memo-quick-chat", wide && "wide")}>
      <div ref={fit.ref} className={cx("memo-quick-status", fit.className)}>
        <span className="memo-quick-name" title="メモのチャット">
          <MessageSquare size={13} aria-hidden />
          <span className="memo-quick-name-text">メモのチャット</span>
        </span>
        {/* メモのチャットのピルの列（指示の履歴・ToDo・サブエージェント・子チャット・メモ。閉じている欄の中のチャットの画面がここに描く）。
            名前と同じ行に並べる（別の行にすると、入力欄の上が 2 行になって高くなる） */}
        <div ref={chipsRef} className="memo-quick-chips" />
        <span className="memo-quick-state" role="status">
          {state !== "read" && (
          <>
              <StatusSlot state={state} />
              <span className="memo-quick-status-text">{STATUS_TEXTS[state]}</span>
            </>
          )}
        </span>
        {/* 右端: 会話を開く（欄の「チャット表示のみ」と逆向きの矢印）・非表示にする（欄の × と同じ） */}
        <span className="memo-quick-actions">
          <IconButton icon={Maximize2} size={13} label="会話を開く" title="メモのチャットの欄を開く（これまでのやり取りを見る）" onClick={onOpenChat} />
          <CloseButton size={14} label="非表示にする" title="メモのチャットを非表示にし、メモだけを広く見る（見出しの吹き出しのボタンで開く・▾ で戻せる）" onClick={onHide} />
        </span>
      </div>
      {/* チャットができたら選択（モデルなど）をそのチャットのものから始め直す */}
      <MemoQuickComposer key={chat?.id ?? "new"} projectId={projectId} path={path} chat={chat} beforeSend={beforeSend} queueRef={queueRef} queued={Boolean(chat) && queued} />
    </div>
  );
}

/** 入力欄の上の 1 行に入らないときの詰め方（段の順。CSS の .memo-quick-status の fit-… と同じ順） */
const FIT_STEPS = ["fit-state", "short-chips", "fit-name", "fit-no-chips"] as const;

/**
 * 入力欄の上の 1 行（名前・ピル・様子・ボタン）を、幅に合わせて段ごとに詰める（useOverflowLevel。実際に入るかを測り、決め打ちの幅では切り替えない）:
 * 様子の文を消す → ピルをアイコンと数だけに → 名前をアイコンだけに → ピルを隠す。段は重ねて付ける（2 段目なら 1 段目も）。
 * ピルはメモのチャットの画面が描くので、行の中身（ピルの増減・数・様子の文）が変わったら測り直す
 * （ピルを押して開いた一覧の中の変わり目は数えない。一覧は行の幅に関わらず、作業中は中身が何度も変わるため）
 */
function useQuickStatusFit() {
  const [contentKey, setContentKey] = useState(0);
  const fit = useOverflowLevel<HTMLDivElement>(FIT_STEPS.length, contentKey);
  const { ref } = fit;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const inPopover = (node: Node) => Boolean((node instanceof Element ? node : node.parentElement)?.closest(".chip-popover"));
    const observer = new MutationObserver((records) => {
      if (records.some((r) => !inPopover(r.target))) setContentKey((k) => k + 1);
    });
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [ref]);
  return { ref, className: cx(...FIT_STEPS.map((step, i) => fit.level > i && step)) };
}

/**
 * メモのチャットに送る入力欄。チャットがあれば送り方はチャットの画面と同じ（useChatSend。作業中はチャット欄の切り替えの いま / あとで、
 * 送信の ▾ の「質問として送る」、中断。送信待ちがあれば送信待ちに足す）。入力欄のすぐ上に送信待ちを描いてもらう場所（queueRef）を置く。まだなければ、送るとメモのチャットを作る（作業中にはならないので、送り方の切り替えも ▾ も出さない）
 */
function MemoQuickComposer({
  projectId,
  path,
  chat,
  beforeSend,
  queueRef,
  queued,
}: {
  projectId: number;
  path: string;
  chat: Chat | undefined;
  beforeSend: () => Promise<void>;
  queueRef: (el: HTMLDivElement | null) => void;
  queued: boolean;
}) {
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
    // 送信待ちがあれば送信待ちに足す（チャット欄と同じ）。裏の作業・圧縮中の様子は読まない（会話の欄を開けば分かる）
    queued,
    compactHold: null,
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
      {/* メモのチャットの送信待ち（閉じている欄の中のチャットの画面がここに描く。入力欄とつなげて 1 枚の枠に見せる） */}
      <div ref={queueRef} className="memo-quick-queue" />
      <Composer
        chatContext={{ projectId, exclude: chat?.id }}
        options={options}
        busy={busy}
        queueWhileIdle={!busy && queued}
        placeholder={busy ? send.placeholder : PLACEHOLDER}
        sendLabel={busy ? send.sendLabel : undefined}
        onSend={onSend}
        onQueue={send.onQueue}
        busyControls={<QueueModeToggle busy={busy} value={send.queueMode} onChange={send.setQueueMode} />}
        stopping={stopping}
        onStop={chat ? send.onStop : undefined}
        trailing={<ContextMeter chat={chat ?? null} projectId={projectId} compacting={null} reserved={null} afterTurn={false} />}
        header={<SnippetBar projectId={projectId} composer={composer} onSend={(text) => (busy ? send.onQueue(text, []) : onSend(text, []))} />}
        // 入力欄の右クリックで帯を出す・隠す（隠していても入力欄から戻せる）
        menuItems={<SnippetBarToggleItem />}
        suggestTarget={{ projectId, worktree: chat?.worktree_path ?? undefined }}
        handleRef={composer}
        draft={chat ? chatDraft(chat.id) : undefined}
        savedAttachments={chat ? settingAttachmentDraft(chatAttachmentsDraft(chat.id)) : undefined}
        sendTo={chat ? [{ label: "質問として送る", hint: "答えが返ったら、送信待ちを一時停止", icon: OctagonPause, onSend: send.onAsk }] : undefined}
      />
    </div>
  );
}
