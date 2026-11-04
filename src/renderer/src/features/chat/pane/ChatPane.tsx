import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Approval, Project, Chat, ChatEvent, ChatLive } from "@shared/types";
import { api } from "@/api";
import { useBusyNeighbors } from "@/features/worktree/useBusyNeighbors";
import { useSetting } from "@/hooks/useSetting";
import { chatDraft, STICKY_PROMPT_HIDDEN } from "@/lib/storageKeys";
import { FileLinkContext } from "@/features/fileLinks/fileLinkContext";
import { useFileLinks } from "@/features/fileLinks/useFileLinks";
import { Composer } from "@/features/chat/composer/Composer";
import { QueueModeToggle, queueModeTexts, useQueueMode } from "@/features/chat/composer/QueueModeToggle";
import type { ComposerHandle } from "@/features/chat/composer/composerHandle";
import { ContextMeter } from "@/features/chat/composer/ContextMeter";
import { ChatHeader } from "./ChatHeader";
import { useChatOptions } from "@/features/chat/options/ChatOptionsBar";
import { ChatTimeline } from "@/features/chat/timeline/ChatTimeline";
import { confirmStopAgents } from "@/features/chat/status/backgroundLabel";
import { SubagentChip, useSubagents } from "@/features/chat/subagents/Subagents";
import { QueuedMessages } from "@/features/chat/queue/QueuedMessages";
import { TodoChip } from "@/features/chat/status/TodoChip";
import { OpenSubagentContext } from "@/features/chat/tools/ToolGroup";
import { promptListOf } from "@/features/chat/prompts/promptHistory";
import { groupEvents, relativize } from "@/features/chat/timeline/timelineItems";
import { useChatDetail } from "./useChatDetail";
import { PanelTop, TriangleAlert } from "lucide-react";
import { TextWidthToggle, useWideText } from "./TextWidthToggle";
import { IconButton } from "@/ui/IconButton";
import { cx } from "@/lib/cx";
import { ChatFind } from "@/features/chat/find/ChatFind";
import { PromptsChip } from "@/features/chat/prompts/PromptsChip";
import { usePromptKeys } from "@/features/chat/prompts/usePromptKeys";
import { useChatFindKey } from "@/features/chat/find/useChatFindKey";
import { jumpToEvent } from "@/features/chat/timeline/jumpToEvent";
import { useTimelineWindow } from "@/features/chat/timeline/useTimelineWindow";
import { RewindContext } from "@/features/chat/messages/MessageItems";
import { SelectionComment } from "@/features/chat/messages/SelectionComment";
import { confirmRewindSend, restoreFilesBefore } from "@/features/chat/rewind/rewindActions";
import { RetryContext, useRetryActions } from "@/features/chat/rewind/FailedTurnActions";

interface ChatPaneProps {
  chatId: number;
  /** 検索結果から開いたとき、スクロールして強調する発言（イベント ID） */
  focus?: number;
  /** チャットを読み込んだとき・名前が変わったとき（パネルのタブの名前に使う） */
  onChatChange?: (chat: Chat) => void;
  /** パネルで表示しているか（裏のタブ・閉じたパネルでは false） */
  visible?: boolean;
  /** サブエージェントの中身を、パネルの新しいタブで開く */
  onOpenSubagent: (toolUseId: string, title: string) => void;
}

/** エージェントとのチャット（ボードの右側のパネルに出す） */
export function ChatPane({ chatId, focus, onChatChange, visible = true, onOpenSubagent }: ChatPaneProps) {
  const { chat, project, events, approvals, live, streaming, error } = useChatDetail(chatId);

  // パネルのタブに、チャット（名前・状態・固定など）を知らせる（変わったらタブとその右クリックのメニューもすぐ変わる）
  const notifyChat = useRef(onChatChange);
  notifyChat.current = onChatChange;
  useEffect(() => {
    if (chat) notifyChat.current?.(chat);
  }, [chat]);

  if (error) return <div className="page error">{error}</div>;
  if (!chat) return <div className="page muted">読み込み中…</div>;
  return (
    <ChatView chat={chat} project={project} events={events} approvals={approvals} live={live} streaming={streaming} focus={focus} visible={visible} onOpenSubagent={onOpenSubagent} />
  );
}

function ChatView({
  chat,
  project,
  events,
  approvals,
  live: coreLive,
  streaming,
  focus,
  visible,
  onOpenSubagent,
}: {
  chat: Chat;
  project?: Project;
  events: ChatEvent[];
  approvals: Approval[];
  /** 作業中の様子（コアが持つ形のまま。停止中はほかの画面から止めたときも） */
  live: ChatLive;
  /** 書いている途中の返答 */
  streaming: string;
  focus?: number;
  /** チャットを表示しているか（最新の結果を一番下まで見たら既読にする） */
  visible: boolean;
  onOpenSubagent: (toolUseId: string, title: string) => void;
}) {
  const options = useChatOptions(
    { model: chat.model, effort: chat.effort, permission_mode: chat.permission_mode, fast_mode: chat.fast_mode },
    chat.project_id,
    chat.worktree_path || undefined,
  );
  const busy = chat.status === "running";
  // 停止を押して、止まるのを待っている（押してからコアの知らせが届くまでの間も含める。止まったら戻す）
  const [stopClicked, setStopClicked] = useState(false);
  useEffect(() => {
    if (!busy) setStopClicked(false);
  }, [busy]);
  // 画面に出す作業中の様子: 停止中は押した直後から、会話の圧縮中は作業中だけ（作業中の行・チャット欄のメーターで知らせる）
  const live = useMemo<ChatLive>(
    () => ({ ...coreLive, stopping: busy && (stopClicked || coreLive.stopping), compacting: busy ? coreLive.compacting : null }),
    [coreLive, busy, stopClicked],
  );
  const queued = live.queue.messages.length > 0;
  const subagents = useSubagents(chat.id, events, busy, live.background);
  // 裏で動いているサブエージェント（作業を止めると一緒に止まる。古い Claude Code では一覧の知らせがないので、一覧の行から数える）
  const runningAgents = subagents.filter((s) => s.status === "running").length;
  const busyNeighbors = useBusyNeighbors(chat.project_id, chat.worktree_path, chat.id);
  // サブエージェントの中身は、パネルの新しいタブで開く（ツールのまとまりの「中身を見る」からは呼び出し ID だけが届く）
  // 流れの項目に context で渡すので、描き直しのたびに作り直さない（作り直すと memo した項目がすべて描き直される）
  const openSubRef = useRef({ onOpenSubagent, subagents });
  openSubRef.current = { onOpenSubagent, subagents };
  const openSub = useCallback((toolUseId: string) => {
    const { onOpenSubagent: open, subagents: list } = openSubRef.current;
    open(toolUseId, list.find((s) => s.key === toolUseId)?.description ?? "サブエージェント");
  }, []);
  // 一番下を見ているか（送ったら true に戻し、新しい発言に合わせてスクロールする）
  const stickToBottom = useRef(true);
  const items = useMemo(() => groupEvents(events), [events]);
  // 自分の指示の一覧（指示の履歴・⌘⌥↑ / ↓ で移る・チャット欄の ↑ で前に送った発言を呼び出す。記録が変わったときだけ作り直す）
  const prompts = promptListOf(events);
  // 流れの各項目の memo が効くよう、作業場所が変わらない間は同じ関数にする
  const repoPath = project?.repo_path;
  const rel = useCallback((s: string) => (repoPath ? relativize(s, repoPath) : s), [repoPath]);
  const waiting = approvals.length > 0;
  // 返答の中のファイルのパスを、押してエディタタブで開けるチップにする（作業場所のファイルだけ）
  const fileLinks = useFileLinks(chat, project?.repo_path);
  // 作業中に送ったときの扱い（伝える / ためておく。どのチャットでも同じ）
  const [queueMode, setQueueMode] = useQueueMode();
  const composerTexts = queueModeTexts(busy, queued, queueMode);
  // チャットの中の検索を開いているか・発言へ移る（指示の履歴・⌘⌥↑ / ↓ から）
  const panelRef = useRef<HTMLDivElement>(null);
  // 発言の一覧から、同じ文を入力欄に入れる
  const composer = useRef<ComposerHandle | null>(null);
  // 一番下へ戻るボタンを置く、ピルの列の右端（描いたら要素が届き、流れの側で置けるか測る）
  const [pillDock, setPillDock] = useState<HTMLSpanElement | null>(null);
  // ⌘F でこのチャットの中の検索欄（見出しの行にいつもある）にピントを移す（ピントがこのチャットにあるとき）
  useChatFindKey(panelRef);
  // 文の幅を広げるか（見出しの行のボタン・設定の「表示」と同じ値）
  const [wide] = useWideText();
  // 上に置く指示の帯を出さないか（見出しの行のボタンと設定の「表示」で切り替える。どのチャットでも同じ）
  const [stickyHidden, setStickyHidden] = useSetting(STICKY_PROMPT_HIDDEN);
  // 流れは最近の項目だけを描く（長いチャットでも軽くする。検索・移り先は、その前後だけを描く）
  const timeline = useTimelineWindow({ items, chatId: chat.id, focus, stickToBottom });
  // 移り先が窓の外なら、窓を広げて描いてから移る
  const [jumpTarget, setJumpTarget] = useState<number | null>(null);
  const jump = (eventId: number) => {
    stickToBottom.current = false;
    // 移ったら流れにピントを置く（続けて ⌘⌥↑ / ↓・↑↓ のスクロールが効くように。一覧を閉じてピントが外れたままにしない）
    panelRef.current?.querySelector<HTMLElement>(".timeline")?.focus({ preventScroll: true });
    if (!timeline.reveal(eventId)) setJumpTarget(eventId);
    else if (panelRef.current) jumpToEvent(panelRef.current, eventId);
  };
  useEffect(() => {
    if (jumpTarget !== null && panelRef.current && jumpToEvent(panelRef.current, jumpTarget)) setJumpTarget(null);
  }, [jumpTarget, timeline.visible]);
  // ⌘⌥↑ / ↓ で前後の指示へ
  const promptNav = usePromptKeys(panelRef, prompts.ids, jump);
  // 自分の発言を書き直して送り直す（作業中はできない）。送る設定は最新のものを使い、値（context）は作業中かが変わるときだけ作り直す（memo を保つ）
  const rewindOptions = useRef(options.options);
  rewindOptions.current = options.options;
  const rewind = useMemo(
    () => ({
      busy,
      // 確かめ（その発言のあとに AI が変えたファイルがあれば、会話だけ / ファイルも から選ぶ）てから送る。やめたら false
      send: async (eventId: number, text: string) => {
        const choice = await confirmRewindSend(chat.id, eventId);
        if (!choice) return false;
        stickToBottom.current = true;
        await api.rewindChat(chat.id, eventId, text, rewindOptions.current, choice.restoreFiles);
        return true;
      },
      restoreFiles: (eventId: number) => restoreFilesBefore(chat.id, eventId),
    }),
    [busy, chat.id],
  );
  // 失敗した作業の直す操作（続きから・深さを下げて・別のモデルで・巻き戻して再試行）
  const retry = useRetryActions(chat.id, events, busy, options, rewind.send);
  return (
    <FileLinkContext.Provider value={fileLinks}>
    <RetryContext.Provider value={retry}>
    <OpenSubagentContext.Provider value={openSub}>
    <RewindContext.Provider value={rewind}>
    <div ref={panelRef} className={cx("chat-page chat-panel", wide && "wide")}>
      <ChatHeader
        chat={chat}
        project={project}
        tools={
          <>
          {/* 文の幅（パネルの大きさは変えず、発言の流れとチャット欄の幅の上限を外す。パネルが狭くて変わらないときは押せない） */}
          <TextWidthToggle panel={panelRef} />
          {/* 上に置く指示の帯の表示・非表示（出しているかは色で示す） */}
          <IconButton
            icon={PanelTop}
            label={stickyHidden ? "指示の帯を表示" : "指示の帯を隠す"}
            title={stickyHidden ? "指示の帯を表示（読んでいる返答の元の指示を上に出す）" : "指示の帯を隠す"}
            aria-pressed={!stickyHidden}
            className={cx("chat-sticky-toggle", !stickyHidden && "on")}
            onClick={() => setStickyHidden(!stickyHidden)}
          />
          {/* このチャットの中の検索欄（いつも見出しの行にあり、⌘F でここにピントが入る） */}
          <ChatFind
            root={panelRef}
            items={items}
            version={timeline.visible}
            onGoto={(eventId) => {
              stickToBottom.current = false;
              timeline.reveal(eventId);
            }}
            onDone={() => panelRef.current?.querySelector<HTMLTextAreaElement>(".chat-composer textarea")?.focus()}
          />
          </>
        }
      />
      {/* 返答の一部を選んでコメントし、チャット欄に添える */}
      <SelectionComment root={panelRef} onAdd={(block) => composer.current?.fill(block, { append: true })} />
      <ChatTimeline items={timeline.visible} lastItem={items.at(-1)} hidden={timeline.hidden} onShowMore={timeline.showMore} after={timeline.hiddenAfter} onShowLater={timeline.showLater} onLatest={timeline.latest} onAtBottom={timeline.atBottom} rel={rel} chat={chat} busy={busy} agents={subagents} onOpenSubagent={(s) => onOpenSubagent(s.key, s.description)} live={live} waiting={waiting} streaming={streaming} approvals={approvals} focus={focus} stickToBottom={stickToBottom} events={events} visible={visible} onPromptStep={promptNav.go} pillDock={pillDock} />
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
          <PromptsChip prompts={prompts.entries} onJump={jump} onReuse={(text) => composer.current?.fill(text)} />
          <TodoChip events={events} />
          <SubagentChip entries={subagents} chat={chat} busy={busy} models={options.models} onOpen={(s) => onOpenSubagent(s.key, s.description)} />
          {/* 上を読んでいる間の一番下へ戻るボタンの置き場所（右端。入る幅があるときだけ流れの側から置く） */}
          <span ref={setPillDock} className="composer-chips-dock" />
        </div>
        {/* 送信待ちの指示は入力欄のすぐ上（流れ → チャットの情報 → 次に送るもの → いま書いているもの の順） */}
        <QueuedMessages chatId={chat.id} queue={live.queue} busy={busy} newChatTarget={{ projectId: chat.project_id, group: chat.group_id ?? undefined }} />
        <Composer
          chatContext={{ projectId: chat.project_id, exclude: chat.id }}
          options={options}
          busy={busy}
          queueWhileIdle={!busy && queued}
          placeholder={composerTexts.placeholder}
          sendLabel={composerTexts.sendLabel}
          onSend={async (text, attachments) => {
            stickToBottom.current = true;
            await api.sendMessage(chat.id, text, options.options, attachments);
          }}
          onQueue={async (text, attachments, mode = queueMode) => {
            // 伝える: 止めずに、いまのやり取りに足す（裏のサブエージェント・コマンドも動き続ける。足せなければ待ちの列へ）。
            // ⌘Enter / ⌘⇧Enter で送ったときは、切り替えに関係なくそのキーの送り方にする
            // 作業していない（送信待ちを止めている）とき: すぐ送る = 送信待ちより先にいま送る / ためておく = 送信待ちの最後に足す
            if (!busy) {
              if (mode === "queue") return void (await api.queueMessage(chat.id, text, options.options, attachments, true));
              stickToBottom.current = true;
              return void (await api.sendMessage(chat.id, text, options.options, attachments));
            }
            stickToBottom.current = true;
            if (mode === "tell") await api.tellChat(chat.id, text, options.options, attachments);
            else await api.queueMessage(chat.id, text, options.options, attachments);
          }}
          busyControls={<QueueModeToggle busy={busy} value={queueMode} onChange={setQueueMode} />}
          stopping={live.stopping}
          onStop={() =>
            void confirmStopAgents(live.background, runningAgents, "中断する").then((ok) => {
              if (!ok) return;
              setStopClicked(true);
              void api.cancelChat(chat.id).catch(() => setStopClicked(false));
            })
          }
          trailing={<ContextMeter chat={chat} compacting={live.compacting !== null} />}
          suggestTarget={{ projectId: chat.project_id, worktree: chat.worktree_path || undefined }}
          handleRef={composer}
          history={prompts.recalls}
          draft={chatDraft(chat.id)}
        />
      </div>
    </div>
    </RewindContext.Provider>
    </OpenSubagentContext.Provider>
    </RetryContext.Provider>
    </FileLinkContext.Provider>
  );
}
