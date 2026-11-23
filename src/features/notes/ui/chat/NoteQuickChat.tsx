import { Maximize2, MessageSquare, OctagonPause } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import type { AgentState, Attachment, Chat } from "@shared/chat/types";
import { notesApi } from "@/features/notes/ui/api";
import { useChatStates } from "@/features/chat/ui/state/chatStates";
import { addChat, useNoteChatOf } from "@/features/chat/ui/store/knownChats";
import { chatComposerDraft, Composer } from "@/features/composer/ui";
import { useChatOptions } from "@/features/ai/ui";
import { useChatSend } from "@/features/composer/ui";
import { handBackFromOf } from "@/features/childChats/ui";
import { ChatStateMark } from "@/features/chat/ui";
import { useWideText } from "@/features/conversation/ui/screen/TextWidthToggle";
import { cx } from "@/foundation/ui/lib/cx";
import { useOverflowLevel } from "@/foundation/ui/hooks/useOverflowCompact";
import { CloseButton, IconButton } from "@/foundation/ui/kit/IconButton";

/** ノートのチャットの様子の文（既読は出さない） */
const STATUS_TEXTS: Record<Exclude<AgentState, "read">, string> = {
  running: "AI が作業しています…",
  needs_input: "AI が回答を待っています",
  failed: "エラーで止まりました",
  unread: "終わりました（返事は会話で）",
};

/** ふだんの入力欄の案内（作業中は、チャット欄と同じく送り方の案内にする） */
const PLACEHOLDER = "このページの直し方を AI に頼む（例: 表を日付順に / 見出しの色を青に）。Enter で送る、Shift+Enter で改行";

/**
 * ノートのページの下の、そのノートを AI に直してもらう入力欄（ノートのチャットの欄を閉じている間だけ出す）。
 * 入力欄はチャット欄と同じ Composer（定型文の帯・添付・ほかのチャットの参照・音声入力・モデルなどの選択・メーター・送信と ▾）で、
 * 送る先はノートのチャット（まだなければ作る）。AI がファイルを書き換えると、ページ・本文はノートの変更の知らせで読み直す。
 * 会話は出さず、入力欄の上は 1 行だけ: 左から名前「ノートのチャット」（欄の見出しと同じアイコンと色。本文の右クリックの「ノートのチャット」の組・
 * 選んだときの「ノートのチャットに追加」の行き先がこの欄だと分かるように）・ノートのチャットを開いたときと同じピルの列（指示の履歴・ToDo・
 * サブエージェント・子チャット・ノート。閉じている欄の中のチャットの画面が chipsPortal でここに描く。指示へ移る・サブエージェントを開くなどは、欄を開いてから）・
 * 作業中・回答待ちなどの様子・右端に「会話を開く」（ノートのチャットの欄を開く）・「非表示にする」（×）。
 * 入力欄のすぐ上に送信待ち（閉じている欄の中のチャットの画面が chipsPortal の queueTarget に描く。並べ替え・書き直し・すぐ送るなどもそのまま）。
 * 送信待ちがあれば（queued）、チャット欄と同じく、作業していなくても送るものを送信待ちに足す。
 * 書きかけの文はノートのチャットの入力欄と共有する（chatComposerDraft）。送る前に書きかけの本文を保存する（beforeSend。保存できなければ送らない）
 */
export function NoteQuickChat({
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
  /** 非表示にする（この入力欄も隠し、ノートだけを広く見る。見出しの吹き出しでいつでも開ける） */
  onHide: () => void;
  /** 名前の横の、ノートのチャットのピルの列を描いてもらう場所（ノートのチャットの画面が chipsPortal で描く） */
  chipsRef: (el: HTMLDivElement | null) => void;
  /** 入力欄のすぐ上の、ノートのチャットの送信待ちを描いてもらう場所（ノートのチャットの画面が chipsPortal で描く） */
  queueRef: (el: HTMLDivElement | null) => void;
  /** ノートのチャットに送信待ちがある */
  queued: boolean;
}) {
  const chat = useNoteChatOf(projectId, path);
  const { stateOf } = useChatStates();
  const state = chat ? stateOf(chat) : "read";
  // 幅はノートのチャットの欄（チャットの画面）と同じ「会話の横幅」に従う（標準なら上限 820px で真ん中、広げるなら幅いっぱい。開け閉めで幅が変わらないように）
  const [wide] = useWideText();
  const { ref: fitRef, ...fit } = useQuickStatusFit();
  return (
    <div className={cx("note-quick-chat", wide && "wide")}>
      <div ref={fitRef} className={cx("note-quick-status", fit.className)}>
        <span className="note-quick-name" title="ノートのチャット">
          <MessageSquare size={13} aria-hidden />
          <span className="note-quick-name-text">ノートのチャット</span>
        </span>
        {/* ノートのチャットのピルの列（指示の履歴・ToDo・サブエージェント・子チャット・ノート。閉じている欄の中のチャットの画面がここに描く）。
            名前と同じ行に並べる（別の行にすると、入力欄の上が 2 行になって高くなる） */}
        <div ref={chipsRef} className="note-quick-chips" />
        <span className="note-quick-state" role="status">
          {chat && state !== "read" && (
          <>
              <ChatStateMark chat={chat} />
              <span className="note-quick-status-text">{STATUS_TEXTS[state]}</span>
            </>
          )}
        </span>
        {/* 右端: 会話を開く（欄の「チャット表示のみ」と逆向きの矢印）・非表示にする（欄の × と同じ） */}
        <span className="note-quick-actions">
          <IconButton size="sm" icon={Maximize2} iconSize={13} label="会話を開く" title="ノートのチャットの欄を開く（これまでのやり取りを見る）" onClick={onOpenChat} />
          <CloseButton size="sm" iconSize={14} label="非表示にする" title="ノートのチャットを非表示にし、ノートだけを広く見る（見出しの吹き出しのボタンで開く・▾ で戻せる）" onClick={onHide} />
        </span>
      </div>
      {/* チャットができたら選択（モデルなど）をそのチャットのものから始め直す */}
      <NoteQuickComposer key={chat?.id ?? "new"} projectId={projectId} path={path} chat={chat} beforeSend={beforeSend} queueRef={queueRef} queued={Boolean(chat) && queued} />
    </div>
  );
}

/** 入力欄の上の 1 行に入らないときの詰め方（段の順。CSS の .note-quick-status の fit-… と同じ順） */
const FIT_STEPS = ["fit-state", "short-chips", "fit-name", "fit-no-chips"] as const;

/**
 * 入力欄の上の 1 行（名前・ピル・様子・ボタン）を、幅に合わせて段ごとに詰める（useOverflowLevel。実際に入るかを測り、決め打ちの幅では切り替えない）:
 * 様子の文を消す → ピルをアイコンと数だけに → 名前をアイコンだけに → ピルを隠す。段は重ねて付ける（2 段目なら 1 段目も）。
 * ピルはノートのチャットの画面が描くので、行の中身（ピルの増減・数・様子の文）が変わったら測り直す
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
 * ノートのチャットに送る入力欄。チャットがあれば送り方はチャットの画面と同じ（useChatSend。作業中はチャット欄の切り替えの いま / あとで、
 * 送信の ▾ の「質問として送る」、中断。送信待ちがあれば送信待ちに足す）。入力欄のすぐ上に送信待ちを描いてもらう場所（queueRef）を置く。まだなければ、送るとノートのチャットを作る（作業中にはならないので、送り方の切り替えも ▾ も出さない）
 */
function NoteQuickComposer({
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
  const options = useChatOptions({
    initial: chat ? { model: chat.model, effort: chat.effort, permission_mode: chat.permission_mode, fast_mode: chat.fast_mode } : undefined,
    projectId,
    worktree: chat?.worktree_path ?? undefined,
    provider: chat?.provider,
  });
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
    holdTexts: null,
    options,
    // 裏の作業の様子は読まないので、中断の前に聞かない（流れを持たないので、送っても付いていくものもない）
    confirmStop: () => Promise.resolve(true),
    onStopping: setStopping,
    beforeSend,
    from: handBackFromOf(chat?.id ?? 0),
  });
  // まだチャットがなければ、送るとノートのチャットを作る（一覧の知らせを待たずに入れ、様子の行・チャットの欄がすぐこのチャットを指すように）
  const start = async (text: string, attachments: Attachment[]) => {
    await beforeSend();
    addChat(await notesApi("POST /api/projects/:projectId/note/chat", { params: { projectId }, body: { path, text, options: options.options, attachments } }));
  };
  return (
    <div className="chat-composer">
      {/* ノートのチャットの送信待ち（閉じている欄の中のチャットの画面がここに描く。入力欄とつなげて 1 枚の枠に見せる） */}
      <div ref={queueRef} className="note-quick-queue" />
      <Composer
        place={{ projectId, worktree: chat?.worktree_path ?? null, chatId: chat?.id ?? null }}
        options={options}
        // 作業中・止めている送信待ちがあるときは、送り方（いま / あとで）に合わせた案内と送信ボタンの説明（チャット欄と同じ）
        placeholder={busy || queued ? send.placeholder : PLACEHOLDER}
        send={{
          busy,
          stopping,
          holdsQueue: !busy && queued,
          submit: chat ? send.submit : ({ text, attachments }) => start(text, attachments),
          // 定型文の「すぐ送る」（チャットの画面と同じく出どころを付けない）
          sendOther: chat ? (text) => send.sendOther(text, []) : (text) => start(text, []),
          stop: chat ? send.stop : undefined,
          label: busy || queued ? send.sendLabel : undefined,
          alternatives: chat ? [{ label: "質問として送る", hint: "答えが返ったら、送信待ちを一時停止", icon: OctagonPause, submit: send.ask }] : undefined,
        }}
        draft={chat ? chatComposerDraft(chat.id) : undefined}
      />
    </div>
  );
}
