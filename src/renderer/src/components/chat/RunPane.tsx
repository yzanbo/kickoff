import { useEffect, useMemo, useRef, useState } from "react";
import type { Approval, Project, QueuedMessage, Run, RunEvent } from "../../../../core/types";
import { api } from "../../api";
import { useBusyNeighbors } from "../../hooks/useBusyNeighbors";
import { useSharedFlag } from "../../hooks/useStoredState";
import { CHAT_WIDE_KEY, chatDraftKey } from "../../storageKeys";
import { FileLinkContext } from "../fileLinks/fileLinkContext";
import { useFileLinks } from "../fileLinks/useFileLinks";
import { BUSY_STATUSES } from "../RunStatus";
import { Composer, SendCancelled, type QueueSendMode } from "./Composer";
import { confirmDialog } from "../../dialogs";
import { ContextMeter } from "./ContextMeter";
import { RunHeader } from "./RunHeader";
import { closeChatWithChoice } from "./closeChat";
import { useRunOptions } from "./RunOptionsBar";
import type { Connection } from "./ConnectionStatus";
import { RunTimeline } from "./RunTimeline";
import { SubagentDetail } from "./SubagentDetail";
import { SubagentChip, useSubagents } from "./Subagents";
import { QueuedMessages } from "./QueuedMessages";
import { TodoChip } from "./TodoChip";
import { OpenSubagentContext } from "./ToolGroup";
import { userPrompts } from "./promptHistory";
import { groupEvents, relativize } from "./timelineItems";
import { useRunDetail } from "./useRunDetail";
import { ListPlus, MoveHorizontal, Search, Zap } from "lucide-react";
import { cx } from "../../cx";
import { IconButton } from "../IconButton";
import { ChatFind } from "./ChatFind";
import { PromptsChip } from "./PromptsChip";
import { jumpToEvent } from "./jumpToEvent";
import { RewindContext } from "./MessageItems";
import { useStoredChoice } from "../../hooks/useStoredState";
import { QUEUE_MODE_KEY } from "../../storageKeys";
import { Segmented, type SegmentOption } from "../Segmented";

type QueueMode = QueueSendMode;

/** 作業中に送ったときの扱いの選択肢（アイコンだけで出す） */
const QUEUE_MODE_OPTIONS: SegmentOption<QueueMode>[] = [
  { value: "queue", label: "ためておく（いまの作業が終わったら送る。どちらを選んでいても ⌘⇧Enter でためておける）", icon: ListPlus, iconOnly: true },
  { value: "interrupt", label: "割り込む（いまの作業を止めてすぐ送る。どちらを選んでいても ⌘Enter で割り込める）", icon: Zap, iconOnly: true },
];

interface RunPaneProps {
  projectId: number;
  runId: number;
  /** 検索結果から開いたとき、スクロールして強調する発言（イベント ID） */
  focus?: number;
  /** パネルを閉じる */
  onClose: () => void;
  /** チャットを読み込んだとき・名前が変わったとき（パネルのタブの名前に使う） */
  onRunChange?: (run: Run) => void;
  /** パネルで表示しているか（裏のタブ・閉じたパネルでは false） */
  visible?: boolean;
}

/** エージェントとのチャット（ボードの右側のパネルに出す） */
export function RunPane({ projectId, runId, focus, onClose, onRunChange, visible = true }: RunPaneProps) {
  const { run, project, events, approvals, queue, queuePaused, queueStopAfter, retry, reconnect, live, error } = useRunDetail(runId, projectId);

  // パネルのタブに、チャットの名前を知らせる（名前を変えたらタブもすぐ変わる）
  const notifyRun = useRef(onRunChange);
  notifyRun.current = onRunChange;
  useEffect(() => {
    if (run) notifyRun.current?.(run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id, run?.title]);

  // 開いて見たので「未読」を消す（パネルに表示したとき・見ている間に作業が終わったとき）。
  // 右クリックの「未読にする」で付けた印は、表示したままでも消さず、次に開くまで残す
  useEffect(() => {
    if (visible && run?.attention) void api.markSeen(run.id).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, run?.id, run?.status]);

  if (error) return <div className="page error">{error}</div>;
  if (!run) return <div className="page muted">読み込み中…</div>;
  return (
    <RunView run={run} project={project} events={events} approvals={approvals} queue={queue} queuePaused={queuePaused} queueStopAfter={queueStopAfter} connection={{ retry, reconnect }} live={live} focus={focus} onClose={onClose} />
  );
}

function RunView({
  run,
  project,
  events,
  approvals,
  queue,
  queuePaused,
  queueStopAfter,
  connection,
  live,
  focus,
  onClose,
}: {
  run: Run;
  project?: Project;
  events: RunEvent[];
  approvals: Approval[];
  queue: QueuedMessage[];
  /** 待ちの列を、終わっても自動で送らずに止めておくか */
  queuePaused: boolean;
  /** 「ここまで自動で送る」の印を付けた待ちの指示 */
  queueStopAfter: string | null;
  /** 通信の再試行中・つながるのを待っているところ */
  connection: Connection;
  live: string;
  focus?: number;
  onClose: () => void;
}) {
  const options = useRunOptions(
    { model: run.model, effort: run.effort, permission_mode: run.permission_mode, fast_mode: run.fast_mode },
    run.project_id,
    run.worktree_path || undefined,
  );
  const busy = BUSY_STATUSES.includes(run.status);
  const subagents = useSubagents(run.id, events, busy);
  // 裏で動いているサブエージェント（作業を止めると一緒に止まる）
  const runningAgents = subagents.filter((s) => s.status === "running").length;
  /** 作業を止める前に、裏で動いているサブエージェントも止まることを確かめる（なければそのまま true） */
  const confirmStopAgents = (action: string) =>
    runningAgents === 0
      ? Promise.resolve(true)
      : confirmDialog({
          title: `裏で動いているサブエージェント ${runningAgents} 件も止まります`,
          message: `${action}と、いまの作業と一緒に、裏で動いているサブエージェントも止まり、その報告は届きません。終わるまで待つときは、キャンセルして「ためておく」で送ってください。`,
          confirmLabel: `${action}`,
          danger: true,
        });
  const busyNeighbors = useBusyNeighbors(run);
  // 中身を見ているサブエージェント（Task / Agent の呼び出し ID）
  const [subOpen, setSubOpen] = useState<string>();
  const openedSub = subagents.find((s) => s.key === subOpen);
  // 一番下を見ているか（送ったら true に戻し、新しい発言に合わせてスクロールする）
  const stickToBottom = useRef(true);
  const items = useMemo(() => groupEvents(events), [events]);
  // チャット欄の ↑ で呼び出す、前に送った自分の発言
  const prompts = useMemo(() => userPrompts(events), [events]);
  const rel = (s: string) => (project ? relativize(s, project.repo_path) : s);
  const waiting = approvals.length > 0;
  // 返答の中のファイルのパスを、押してエディタタブで開けるチップにする（作業場所のファイルだけ）
  const fileLinks = useFileLinks(run, project?.repo_path);
  // 作業中に送ったときの扱い（ためておく / 割り込む。どのチャットでも同じ）
  const [queueMode, setQueueMode] = useStoredChoice<QueueMode>(QUEUE_MODE_KEY, ["queue", "interrupt"], "queue");
  // 停止を押して、止まるのを待っている（止まったら戻す）
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    if (!busy) setStopping(false);
  }, [busy]);
  // チャットの中の検索を開いているか・発言へ移る（目次から）
  const panelRef = useRef<HTMLDivElement>(null);
  // 発言の一覧から、同じ文を入力欄に入れる
  const fillComposer = useRef<((text: string) => void) | null>(null);
  const [finding, setFinding] = useState(false);
  // 横幅いっぱいに広げるか（設定の「表示」と同じ値）
  const [wide, setWide] = useSharedFlag(CHAT_WIDE_KEY);
  const jump = (eventId: number) => {
    stickToBottom.current = false;
    if (panelRef.current) jumpToEvent(panelRef.current, eventId);
  };
  // 自分の発言を書き直して送り直す（その発言から後ろを消して巻き戻す。作業中はできない）
  const rewind = useMemo(
    () => ({
      busy,
      send: async (eventId: number, text: string) => {
        stickToBottom.current = true;
        await api.rewindRun(run.id, eventId, text, options.options);
      },
    }),
    [busy, run.id, options.options],
  );

  return (
    <FileLinkContext.Provider value={fileLinks}>
    <OpenSubagentContext.Provider value={setSubOpen}>
    <RewindContext.Provider value={rewind}>
    <div ref={panelRef} className={cx("run-page run-panel", finding && "finding", wide && "wide")}>
      <RunHeader
        run={run}
        project={project}
        waiting={waiting}
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
        onClose={() => void closeChatWithChoice(run, onClose)}
      />
      {finding && <ChatFind root={panelRef} version={items} onJump={() => (stickToBottom.current = false)} onClose={() => setFinding(false)} />}
      <RunTimeline items={items} rel={rel} run={run} busy={busy} runningAgents={runningAgents} waiting={waiting} stopping={stopping} live={live} connection={connection} approvals={approvals} focus={focus} stickToBottom={stickToBottom} />
      <div className="run-composer">
        {/* チャット欄のすぐ上に、このチャットのサブエージェントなどをピルで並べる */}
        <div className="composer-chips">
          <PromptsChip events={events} onJump={jump} onReuse={(text) => fillComposer.current?.(text)} />
          <TodoChip events={events} />
          <SubagentChip entries={subagents} run={run} models={options.models} onOpen={(s) => setSubOpen(s.key)} />
          {/* 同じ作業場所で、ほかのチャットも作業中なら知らせる（同じファイルを触るとぶつかる） */}
          {busyNeighbors > 0 && (
            <span className="small warn-text">この作業場所では、ほかのチャット {busyNeighbors} 件も作業中です。同じファイルを触ると作業がぶつかることがあります。</span>
          )}
        </div>
        {/* 送信待ちの指示は入力欄のすぐ上（流れ → チャットの情報 → 次に送るもの → いま書いているもの の順） */}
        <QueuedMessages runId={run.id} queue={queue} paused={queuePaused} stopAfter={queueStopAfter} busy={busy} />
        <Composer
          options={options}
          busy={busy}
          placeholder={
            busy
              ? queueMode === "interrupt"
                ? "作業中です。Enter で割り込んですぐ送ります（⌘⇧Enter でためておく）"
                : "作業中です。Enter でためておき、終わったら送ります（⌘Enter で割り込んですぐ送る）"
              : "続けて指示する（Enter で送信、Shift+Enter で改行）"
          }
          onSend={async (text, attachments) => {
            stickToBottom.current = true;
            await api.sendMessage(run.id, text, options.options, attachments);
          }}
          onQueue={async (text, attachments, mode = queueMode) => {
            // 割り込むときは、待ちの列を通さずに、いまの作業を止めてからすぐ送る（列に一瞬出さない）。
            // ⌘Enter / ⌘⇧Enter で送ったときは、切り替えに関係なくそのキーの送り方にする
            if (mode === "interrupt") {
              if (!(await confirmStopAgents("割り込んで送る"))) throw new SendCancelled();
              await api.interrupt(run.id, text, options.options, attachments);
            }
            else await api.queueMessage(run.id, text, options.options, attachments);
          }}
          busyControls={
            <Segmented<QueueMode>
              value={queueMode}
              options={QUEUE_MODE_OPTIONS}
              onChange={setQueueMode}
              label="作業中に送ったときの扱い"
              className="view-toggle queue-mode"
            />
          }
          onStop={() =>
            void confirmStopAgents("中断する").then((ok) => {
              if (!ok) return;
              setStopping(true);
              void api.cancelRun(run.id).catch(() => setStopping(false));
            })
          }
          trailing={<ContextMeter run={run} />}
          suggestTarget={{ projectId: run.project_id, worktree: run.worktree_path || undefined }}
          fillRef={fillComposer}
          history={prompts}
          draftKey={chatDraftKey(run.id)}
        />
      </div>
      {openedSub && <SubagentDetail entry={openedSub} events={events} rel={rel} busy={busy} onClose={() => setSubOpen(undefined)} />}
    </div>
    </RewindContext.Provider>
    </OpenSubagentContext.Provider>
    </FileLinkContext.Provider>
  );
}
