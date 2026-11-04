import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Approval, BackgroundState, Project, QueuedMessage, Run, RunEvent } from "../../../../core/types";
import { api } from "../../api";
import { useBusyNeighbors } from "../../hooks/useBusyNeighbors";
import { useSharedFlag } from "../../hooks/useStoredState";
import { CHAT_WIDE_KEY, chatDraftKey } from "../../storageKeys";
import { FileLinkContext } from "../fileLinks/fileLinkContext";
import { useFileLinks } from "../fileLinks/useFileLinks";
import { BUSY_STATUSES } from "../RunStatus";
import { Composer } from "./Composer";
import { QueueModeToggle, queueModeTexts, useQueueMode } from "./QueueModeToggle";
import type { ComposerFill } from "./quoteComment";
import { ContextMeter } from "./ContextMeter";
import { RunHeader } from "./RunHeader";
import { useRunOptions } from "./RunOptionsBar";
import type { Connection } from "./ConnectionStatus";
import { RunTimeline } from "./RunTimeline";
import { confirmStopAgents } from "./backgroundLabel";
import { SubagentChip, useSubagents } from "./Subagents";
import { QueuedMessages } from "./QueuedMessages";
import { TodoChip } from "./TodoChip";
import { OpenSubagentContext } from "./ToolGroup";
import { promptEntries, userPrompts } from "./promptHistory";
import { groupEvents, relativize } from "./timelineItems";
import { useRunDetail } from "./useRunDetail";
import { MoveHorizontal, Search, TriangleAlert } from "lucide-react";
import { cx } from "../../cx";
import { IconButton } from "../IconButton";
import { ChatFind } from "./ChatFind";
import { PromptsChip } from "./PromptsChip";
import { usePromptKeys } from "./usePromptKeys";
import { jumpToEvent } from "./jumpToEvent";
import { useTimelineWindow } from "./useTimelineWindow";
import { RewindContext } from "./MessageItems";
import { SelectionComment } from "./SelectionComment";
import { confirmRewindSend, restoreFilesBefore } from "./rewindActions";
import { RetryContext, useRetryActions } from "./FailedTurnActions";

interface RunPaneProps {
  projectId: number;
  runId: number;
  /** 検索結果から開いたとき、スクロールして強調する発言（イベント ID） */
  focus?: number;
  /** チャットを読み込んだとき・名前が変わったとき（パネルのタブの名前に使う） */
  onRunChange?: (run: Run) => void;
  /** パネルで表示しているか（裏のタブ・閉じたパネルでは false） */
  visible?: boolean;
  /** サブエージェントの中身を、パネルの新しいタブで開く */
  onOpenSubagent: (toolUseId: string, title: string) => void;
}

/** エージェントとのチャット（ボードの右側のパネルに出す） */
export function RunPane({ projectId, runId, focus, onRunChange, visible = true, onOpenSubagent }: RunPaneProps) {
  const { run, project, events, approvals, queue, queuePaused, queueStops, queueWaitingEdit, retry, reconnect, background, stopping, live, error } = useRunDetail(runId, projectId);

  // パネルのタブに、チャット（名前・状態・固定など）を知らせる（変わったらタブとその右クリックのメニューもすぐ変わる）
  const notifyRun = useRef(onRunChange);
  notifyRun.current = onRunChange;
  useEffect(() => {
    if (run) notifyRun.current?.(run);
  }, [run]);

  if (error) return <div className="page error">{error}</div>;
  if (!run) return <div className="page muted">読み込み中…</div>;
  return (
    <RunView run={run} project={project} events={events} approvals={approvals} queue={queue} queuePaused={queuePaused} queueStops={queueStops} queueWaitingEdit={queueWaitingEdit} connection={{ retry, reconnect }} background={background} stopping={stopping} live={live} focus={focus} visible={visible} onOpenSubagent={onOpenSubagent} />
  );
}

function RunView({
  run,
  project,
  events,
  approvals,
  queue,
  queuePaused,
  queueStops,
  queueWaitingEdit,
  connection,
  background,
  stopping: stopRequested,
  live,
  focus,
  visible,
  onOpenSubagent,
}: {
  run: Run;
  project?: Project;
  events: RunEvent[];
  approvals: Approval[];
  queue: QueuedMessage[];
  /** 待ちの列を、終わっても自動で送らずに止めておくか */
  queuePaused: boolean;
  /** 一時停止の印の位置（0 = 1 件目の上、n = n 件目のあと） */
  queueStops: number[];
  /** 次の指示の書き直しが終わるのを待っている（作業は終わり、送信の準備ができている） */
  queueWaitingEdit: boolean;
  /** 通信の再試行中・つながるのを待っているところ */
  connection: Connection;
  /** 裏で動いている作業と、メインの返答が終わったか */
  background: BackgroundState | null;
  /** 停止を頼んで、作業が終わるのを待っているか（コアが持つ。ほかの画面から止めたときも） */
  stopping: boolean;
  live: string;
  focus?: number;
  /** チャットを表示しているか（最新の結果を一番下まで見たら既読にする） */
  visible: boolean;
  onOpenSubagent: (toolUseId: string, title: string) => void;
}) {
  const options = useRunOptions(
    { model: run.model, effort: run.effort, permission_mode: run.permission_mode, fast_mode: run.fast_mode },
    run.project_id,
    run.worktree_path || undefined,
  );
  const busy = BUSY_STATUSES.includes(run.status);
  const subagents = useSubagents(run.id, events, busy, background);
  // 裏で動いているサブエージェント（作業を止めると一緒に止まる。古い Claude Code では一覧の知らせがないので、一覧の行から数える）
  const runningAgents = subagents.filter((s) => s.status === "running").length;
  const busyNeighbors = useBusyNeighbors(run);
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
  // チャット欄の ↑ で呼び出す、前に送った自分の発言
  const prompts = useMemo(() => userPrompts(events), [events]);
  // 自分の指示の一覧（⌘⌥↑ / ↓ で移る）
  const entries = useMemo(() => promptEntries(events), [events]);
  // 流れの各項目の memo が効くよう、作業場所が変わらない間は同じ関数にする
  const repoPath = project?.repo_path;
  const rel = useCallback((s: string) => (repoPath ? relativize(s, repoPath) : s), [repoPath]);
  const waiting = approvals.length > 0;
  // 返答の中のファイルのパスを、押してエディタタブで開けるチップにする（作業場所のファイルだけ）
  const fileLinks = useFileLinks(run, project?.repo_path);
  // 作業中に送ったときの扱い（伝える / ためておく。どのチャットでも同じ）
  const [queueMode, setQueueMode] = useQueueMode();
  const composerTexts = queueModeTexts(busy, queue.length > 0, queueMode);
  // 停止を押して、止まるのを待っている（押してからコアの知らせが届くまでの間も含める。止まったら戻す）
  const [stopClicked, setStopClicked] = useState(false);
  useEffect(() => {
    if (!busy) setStopClicked(false);
  }, [busy]);
  const stopping = busy && (stopClicked || stopRequested);
  // チャットの中の検索を開いているか・発言へ移る（指示の履歴・⌘⌥↑ / ↓ から）
  const panelRef = useRef<HTMLDivElement>(null);
  // 発言の一覧から、同じ文を入力欄に入れる
  const fillComposer = useRef<ComposerFill | null>(null);
  const [finding, setFinding] = useState(false);
  // 横幅いっぱいに広げるか（設定の「表示」と同じ値）
  const [wide, setWide] = useSharedFlag(CHAT_WIDE_KEY);
  // 流れは最近の項目だけを描く（長いチャットでも軽くする。検索・移り先は、その前後だけを描く）
  const timeline = useTimelineWindow({ items, runId: run.id, focus, stickToBottom });
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
  usePromptKeys(panelRef, entries, jump);
  // 自分の発言を書き直して送り直す（作業中はできない）。送る設定は最新のものを使い、値（context）は作業中かが変わるときだけ作り直す（memo を保つ）
  const rewindOptions = useRef(options.options);
  rewindOptions.current = options.options;
  const rewind = useMemo(
    () => ({
      busy,
      // 確かめ（その発言のあとに AI が変えたファイルがあれば、会話だけ / ファイルも から選ぶ）てから送る。やめたら false
      send: async (eventId: number, text: string) => {
        const choice = await confirmRewindSend(run.id, eventId);
        if (!choice) return false;
        stickToBottom.current = true;
        await api.rewindRun(run.id, eventId, text, rewindOptions.current, choice.restoreFiles);
        return true;
      },
      restoreFiles: (eventId: number) => restoreFilesBefore(run.id, eventId),
    }),
    [busy, run.id],
  );
  // 失敗した作業の直す操作（続きから・深さを下げて・別のモデルで・巻き戻して再試行）
  const retry = useRetryActions(run.id, events, busy, options, rewind.send);
  return (
    <FileLinkContext.Provider value={fileLinks}>
    <RetryContext.Provider value={retry}>
    <OpenSubagentContext.Provider value={openSub}>
    <RewindContext.Provider value={rewind}>
    <div ref={panelRef} className={cx("run-page run-panel", finding && "finding", wide && "wide")}>
      <RunHeader
        run={run}
        project={project}
        tools={
          <>
            {/* 発言の流れとチャット欄を、標準の幅（読みやすい幅）と欄の横幅いっぱいで切り替える（どのチャットでも同じ） */}
            <IconButton
              icon={MoveHorizontal}
              size={13}
              label={wide ? "横幅を標準に戻す" : "横幅いっぱいに広げる"}
              aria-pressed={wide}
              className={cx(wide && "active")}
              onClick={() => setWide(!wide)}
            />
            <IconButton icon={Search} size={13} label="このチャットの中を検索" aria-expanded={finding} onClick={() => setFinding(!finding)} />
          </>
        }
      />
      {/* 返答の一部を選んでコメントし、チャット欄に添える */}
      <SelectionComment root={panelRef} onAdd={(block) => fillComposer.current?.(block, { append: true })} />
      {finding && (
        <ChatFind
          root={panelRef}
          items={items}
          version={timeline.visible}
          onGoto={(eventId) => {
            stickToBottom.current = false;
            timeline.reveal(eventId);
          }}
          onClose={() => setFinding(false)}
        />
      )}
      <RunTimeline items={timeline.visible} lastItem={items.at(-1)} hidden={timeline.hidden} onShowMore={timeline.showMore} after={timeline.hiddenAfter} onShowLater={timeline.showLater} onLatest={timeline.latest} onAtBottom={timeline.atBottom} rel={rel} run={run} busy={busy} agents={subagents} onOpenSubagent={(s) => onOpenSubagent(s.key, s.description)} background={background} waiting={waiting} stopping={stopping} live={live} connection={connection} approvals={approvals} focus={focus} stickToBottom={stickToBottom} events={events} visible={visible} />
      <div className="run-composer">
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
          <PromptsChip events={events} onJump={jump} onReuse={(text) => fillComposer.current?.(text)} />
          <TodoChip events={events} />
          <SubagentChip entries={subagents} run={run} busy={busy} models={options.models} onOpen={(s) => onOpenSubagent(s.key, s.description)} />
        </div>
        {/* 送信待ちの指示は入力欄のすぐ上（流れ → チャットの情報 → 次に送るもの → いま書いているもの の順） */}
        <QueuedMessages runId={run.id} queue={queue} paused={queuePaused} stops={queueStops} waitingEdit={queueWaitingEdit} busy={busy} newChatTarget={{ projectId: run.project_id, group: run.group_id ?? undefined }} />
        <Composer
          chatContext={{ projectId: run.project_id, exclude: run.id }}
          options={options}
          busy={busy}
          queueWhileIdle={!busy && queue.length > 0}
          placeholder={composerTexts.placeholder}
          sendLabel={composerTexts.sendLabel}
          onSend={async (text, attachments) => {
            stickToBottom.current = true;
            await api.sendMessage(run.id, text, options.options, attachments);
          }}
          onQueue={async (text, attachments, mode = queueMode) => {
            // 伝える: 止めずに、いまのやり取りに足す（裏のサブエージェント・コマンドも動き続ける。足せなければ待ちの列へ）。
            // ⌘Enter / ⌘⇧Enter で送ったときは、切り替えに関係なくそのキーの送り方にする
            // 作業していない（送信待ちを止めている）とき: すぐ送る = 送信待ちより先にいま送る / ためておく = 送信待ちの最後に足す
            if (!busy) {
              if (mode === "queue") return void (await api.queueMessage(run.id, text, options.options, attachments, true));
              stickToBottom.current = true;
              return void (await api.sendMessage(run.id, text, options.options, attachments));
            }
            stickToBottom.current = true;
            if (mode === "tell") await api.tellRun(run.id, text, options.options, attachments);
            else await api.queueMessage(run.id, text, options.options, attachments);
          }}
          busyControls={<QueueModeToggle busy={busy} value={queueMode} onChange={setQueueMode} />}
          stopping={stopping}
          onStop={() =>
            void confirmStopAgents(background, runningAgents, "中断する").then((ok) => {
              if (!ok) return;
              setStopClicked(true);
              void api.cancelRun(run.id).catch(() => setStopClicked(false));
            })
          }
          trailing={<ContextMeter run={run} />}
          suggestTarget={{ projectId: run.project_id, worktree: run.worktree_path || undefined }}
          fillRef={fillComposer}
          history={prompts}
          draftKey={chatDraftKey(run.id)}
        />
      </div>
    </div>
    </RewindContext.Provider>
    </OpenSubagentContext.Provider>
    </RetryContext.Provider>
    </FileLinkContext.Provider>
  );
}
