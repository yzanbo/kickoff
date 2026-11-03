import { useEffect, useMemo, useRef, useState } from "react";
import type { Approval, Project, QueuedMessage, Run, RunEvent } from "../../../../core/types";
import { api } from "../../api";
import { useBusyNeighbors } from "../../hooks/useBusyNeighbors";
import { BUSY_STATUSES } from "../RunStatus";
import { Composer } from "./Composer";
import { ContextMeter } from "./ContextMeter";
import { RunHeader } from "./RunHeader";
import { useRunOptions } from "./RunOptionsBar";
import { RunTimeline } from "./RunTimeline";
import { SubagentDetail } from "./SubagentDetail";
import { SubagentChip, useSubagents } from "./Subagents";
import { QueuedMessages } from "./QueuedMessages";
import { TodoChip } from "./TodoChip";
import { OpenSubagentContext } from "./Timeline";
import { userPrompts } from "./promptHistory";
import { groupEvents, relativize } from "./timelineItems";
import { useRunDetail } from "./useRunDetail";
import { ListPlus, Zap } from "lucide-react";
import { useStoredChoice } from "../../hooks/useStoredState";
import { QUEUE_MODE_KEY } from "../../storageKeys";
import { Segmented, type SegmentOption } from "../Segmented";

type QueueMode = "queue" | "interrupt";

/** 作業中に送ったときの扱いの選択肢（アイコンだけで出す） */
const QUEUE_MODE_OPTIONS: SegmentOption<QueueMode>[] = [
  { value: "queue", label: "ためておく（いまの作業が終わったら送る）", icon: ListPlus, iconOnly: true },
  { value: "interrupt", label: "割り込む（いまの作業を止めてすぐ送る）", icon: Zap, iconOnly: true },
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
  const { run, project, events, approvals, queue, live, error } = useRunDetail(runId, projectId);

  // パネルのタブに、チャットの名前を知らせる（名前を変えたらタブもすぐ変わる）
  const notifyRun = useRef(onRunChange);
  notifyRun.current = onRunChange;
  useEffect(() => {
    if (run) notifyRun.current?.(run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id, run?.title]);

  // 開いて見たので「確認待ち」を消す（パネルに表示したとき・見ている間に作業が終わったとき）。
  // 右クリックの「未読にする」で付けた印は、表示したままでも消さず、次に開くまで残す
  useEffect(() => {
    if (visible && run?.attention) void api.markSeen(run.id).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, run?.id, run?.status]);

  if (error) return <div className="page error">{error}</div>;
  if (!run) return <div className="page muted">読み込み中…</div>;
  return (
    <RunView run={run} project={project} events={events} approvals={approvals} queue={queue} live={live} focus={focus} onClose={onClose} />
  );
}

function RunView({
  run,
  project,
  events,
  approvals,
  queue,
  live,
  focus,
  onClose,
}: {
  run: Run;
  project?: Project;
  events: RunEvent[];
  approvals: Approval[];
  queue: QueuedMessage[];
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
  // 作業中に送ったときの扱い（ためておく / 割り込む。どのチャットでも同じ）
  const [queueMode, setQueueMode] = useStoredChoice<QueueMode>(QUEUE_MODE_KEY, ["queue", "interrupt"], "queue");
  // 停止を押して、止まるのを待っている（止まったら戻す）
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    if (!busy) setStopping(false);
  }, [busy]);

  return (
    <OpenSubagentContext.Provider value={setSubOpen}>
    <div className="run-page run-panel">
      <RunHeader run={run} project={project} waiting={waiting} onClose={onClose} />
      <RunTimeline items={items} rel={rel} run={run} busy={busy} waiting={waiting} stopping={stopping} live={live} approvals={approvals} focus={focus} stickToBottom={stickToBottom} />
      <div className="run-composer">
        <QueuedMessages runId={run.id} queue={queue} busy={busy} />
        {/* チャット欄のすぐ上に、このチャットのサブエージェントなどをピルで並べる */}
        <div className="composer-chips">
          <TodoChip events={events} />
          <SubagentChip entries={subagents} run={run} models={options.models} onOpen={(s) => setSubOpen(s.key)} />
          {/* 同じ作業場所で、ほかのチャットも作業中なら知らせる（同じファイルを触るとぶつかる） */}
          {busyNeighbors > 0 && (
            <span className="small warn-text">この作業場所では、ほかのチャット {busyNeighbors} 件も作業中です。同じファイルを触ると作業がぶつかることがあります。</span>
          )}
        </div>
        <Composer
          options={options}
          busy={busy}
          placeholder={
            busy
              ? queueMode === "interrupt"
                ? "作業中です。送ると、いまの作業を止めてすぐ送ります（Enter）"
                : "作業中です。送ると、いまの作業が終わったあとに送ります（Enter）"
              : "続けて指示する（Enter で送信、Shift+Enter で改行）"
          }
          onSend={async (text, attachments) => {
            stickToBottom.current = true;
            await api.sendMessage(run.id, text, options.options, attachments);
          }}
          onQueue={async (text, attachments) => {
            // 割り込むときは、待ちの列を通さずに、いまの作業を止めてからすぐ送る（列に一瞬出さない）
            if (queueMode === "interrupt") await api.interrupt(run.id, text, options.options, attachments);
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
          onStop={() => {
            setStopping(true);
            void api.cancelRun(run.id).catch(() => setStopping(false));
          }}
          trailing={<ContextMeter run={run} />}
          suggestTarget={{ projectId: run.project_id, worktree: run.worktree_path || undefined }}
          history={prompts}
        />
      </div>
      {openedSub && <SubagentDetail entry={openedSub} events={events} rel={rel} busy={busy} onClose={() => setSubOpen(undefined)} />}
    </div>
    </OpenSubagentContext.Provider>
  );
}
