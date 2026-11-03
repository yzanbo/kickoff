import { useEffect, useMemo, useRef, useState } from "react";
import type { Approval, BackgroundState, Project, QueuedMessage, Run, RunEvent } from "../../../../core/types";
import { api } from "../../api";
import { useBusyNeighbors } from "../../hooks/useBusyNeighbors";
import { useSharedFlag } from "../../hooks/useStoredState";
import { CHAT_WIDE_KEY, chatDraftKey } from "../../storageKeys";
import { FileLinkContext } from "../fileLinks/fileLinkContext";
import { useFileLinks } from "../fileLinks/useFileLinks";
import { BUSY_STATUSES } from "../RunStatus";
import { Composer, type QueueSendMode } from "./Composer";
import { confirmDialog } from "../../dialogs";
import { ContextMeter } from "./ContextMeter";
import { RunHeader } from "./RunHeader";
import { useRunOptions } from "./RunOptionsBar";
import type { Connection } from "./ConnectionStatus";
import { RunTimeline } from "./RunTimeline";
import { countBackground } from "./backgroundLabel";
import { SubagentChip, useSubagents } from "./Subagents";
import { QueuedMessages } from "./QueuedMessages";
import { TodoChip } from "./TodoChip";
import { OpenSubagentContext } from "./ToolGroup";
import { userPrompts } from "./promptHistory";
import { groupEvents, relativize } from "./timelineItems";
import { useRunDetail } from "./useRunDetail";
import { ListPlus, MessageSquarePlus, MoveHorizontal, Search } from "lucide-react";
import { cx } from "../../cx";
import { IconButton } from "../IconButton";
import { ChatFind } from "./ChatFind";
import { PromptsChip } from "./PromptsChip";
import { jumpToEvent } from "./jumpToEvent";
import { RewindContext } from "./MessageItems";
import { useStoredState } from "../../hooks/useStoredState";
import { QUEUE_MODE_KEY } from "../../storageKeys";
import { Segmented, type SegmentOption } from "../Segmented";

type QueueMode = QueueSendMode;

/** 作業中に送ったときの扱いの選択肢（アイコンだけで出す） */
const QUEUE_MODE_OPTIONS: SegmentOption<QueueMode>[] = [
  { value: "tell", label: "伝える（止めずに、いまのやり取りに足す。どちらを選んでいても ⌘Enter で伝えられる）", icon: MessageSquarePlus, iconOnly: true },
  { value: "queue", label: "ためておく（いまの作業が終わったら送る。どちらを選んでいても ⌘⇧Enter でためておける）", icon: ListPlus, iconOnly: true },
];

/** 作業中に送ったときの扱いの保存の形（以前の「割り込む」= "interrupt" は、なくしたので「伝える」として読む） */
const readQueueMode = (raw: string | null): QueueMode => (raw === "queue" ? "queue" : "tell");

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
  const { run, project, events, approvals, queue, queuePaused, queueStopAfter, retry, reconnect, background, live, error } = useRunDetail(runId, projectId);

  // パネルのタブに、チャットの名前と状態（作業中・未読など）を知らせる（変わったらタブもすぐ変わる）
  const notifyRun = useRef(onRunChange);
  notifyRun.current = onRunChange;
  useEffect(() => {
    if (run) notifyRun.current?.(run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id, run?.title, run?.status, run?.attention]);

  if (error) return <div className="page error">{error}</div>;
  if (!run) return <div className="page muted">読み込み中…</div>;
  return (
    <RunView run={run} project={project} events={events} approvals={approvals} queue={queue} queuePaused={queuePaused} queueStopAfter={queueStopAfter} connection={{ retry, reconnect }} background={background} live={live} focus={focus} visible={visible} onOpenSubagent={onOpenSubagent} />
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
  background,
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
  /** 「ここまで自動で送る」の印を付けた待ちの指示 */
  queueStopAfter: string | null;
  /** 通信の再試行中・つながるのを待っているところ */
  connection: Connection;
  /** 裏で動いている作業と、メインの返答が終わったか */
  background: BackgroundState | null;
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
  /** 作業を止める前に、裏で動いているサブエージェント・コマンドも止まることを確かめる（なければそのまま true） */
  const confirmStopAgents = (action: string) => {
    const counted = countBackground(background);
    const agents = background ? counted.agents : runningAgents;
    const what = [agents > 0 ? `サブエージェント ${agents} 件` : null, counted.commands > 0 ? `コマンド ${counted.commands} 件` : null].filter(Boolean).join("・");
    return !what
      ? Promise.resolve(true)
      : confirmDialog({
          title: `裏で動いている${what}も止まります`,
          message: `${action}と、いまの作業と一緒に、裏で動いている${what}も止まり、サブエージェントの報告は届きません。終わるまで待つときは、キャンセルして「ためておく」で送ってください。`,
          confirmLabel: `${action}`,
          danger: true,
        });
  };
  const busyNeighbors = useBusyNeighbors(run);
  // サブエージェントの中身は、パネルの新しいタブで開く（ツールのまとまりの「中身を見る」からは呼び出し ID だけが届く）
  const openSub = (toolUseId: string) => onOpenSubagent(toolUseId, subagents.find((s) => s.key === toolUseId)?.description ?? "サブエージェント");
  // 一番下を見ているか（送ったら true に戻し、新しい発言に合わせてスクロールする）
  const stickToBottom = useRef(true);
  const items = useMemo(() => groupEvents(events), [events]);
  // チャット欄の ↑ で呼び出す、前に送った自分の発言
  const prompts = useMemo(() => userPrompts(events), [events]);
  const rel = (s: string) => (project ? relativize(s, project.repo_path) : s);
  const waiting = approvals.length > 0;
  // 返答の中のファイルのパスを、押してエディタタブで開けるチップにする（作業場所のファイルだけ）
  const fileLinks = useFileLinks(run, project?.repo_path);
  // 作業中に送ったときの扱い（伝える / ためておく。どのチャットでも同じ）
  const [queueMode, setQueueMode] = useStoredState<QueueMode>(QUEUE_MODE_KEY, readQueueMode, (mode) => mode);
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
    <OpenSubagentContext.Provider value={openSub}>
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
      />
      {finding && <ChatFind root={panelRef} version={items} onJump={() => (stickToBottom.current = false)} onClose={() => setFinding(false)} />}
      <RunTimeline items={items} rel={rel} run={run} busy={busy} runningAgents={runningAgents} background={background} waiting={waiting} stopping={stopping} live={live} connection={connection} approvals={approvals} focus={focus} stickToBottom={stickToBottom} events={events} visible={visible} />
      <div className="run-composer">
        {/* チャット欄のすぐ上に、このチャットのサブエージェントなどをピルで並べる */}
        <div className="composer-chips">
          <PromptsChip events={events} onJump={jump} onReuse={(text) => fillComposer.current?.(text)} />
          <TodoChip events={events} />
          <SubagentChip entries={subagents} run={run} models={options.models} onOpen={(s) => onOpenSubagent(s.key, s.description)} />
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
              ? queueMode === "tell"
                ? "作業中です。Enter で、止めずにいまのやり取りに伝えます（⌘⇧Enter でためておく）"
                : "作業中です。Enter でためておき、終わったら送ります（⌘Enter で止めずに伝える）"
              : "続けて指示する（Enter で送信、Shift+Enter で改行）"
          }
          onSend={async (text, attachments) => {
            stickToBottom.current = true;
            await api.sendMessage(run.id, text, options.options, attachments);
          }}
          onQueue={async (text, attachments, mode = queueMode) => {
            // 伝える: 止めずに、いまのやり取りに足す（裏のサブエージェント・コマンドも動き続ける。足せなければ待ちの列へ）。
            // ⌘Enter / ⌘⇧Enter で送ったときは、切り替えに関係なくそのキーの送り方にする
            stickToBottom.current = true;
            if (mode === "tell") await api.tellRun(run.id, text, options.options, attachments);
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
    </div>
    </RewindContext.Provider>
    </OpenSubagentContext.Provider>
    </FileLinkContext.Provider>
  );
}
