import { useEffect, useMemo, useRef, useState } from "react";
import type { Approval, Project, Run, RunEvent } from "../../../../core/types";
import { api } from "../../api";
import { useBusyNeighbors } from "../../hooks/useBusyNeighbors";
import { BUSY_STATUSES } from "../RunStatus";
import type { TerminalTarget } from "../sidePanel/useSidePanel";
import { Composer } from "./Composer";
import { ContextMeter } from "./ContextMeter";
import { RunHeader } from "./RunHeader";
import { useRunOptions } from "./RunOptionsBar";
import { RunTimeline } from "./RunTimeline";
import { SubagentDetail } from "./SubagentDetail";
import { SubagentChip, useSubagents } from "./Subagents";
import { OpenSubagentContext } from "./Timeline";
import { groupEvents, relativize } from "./timelineItems";
import { useRunDetail } from "./useRunDetail";

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
  /** このチャットの作業場所でターミナルを開く（右のパネルのタブ。Mac のアプリでだけ渡す） */
  onOpenTerminal?: (target: TerminalTarget) => void;
}

/** エージェントとのチャット（ボードの右側のパネルに出す） */
export function RunPane({ projectId, runId, focus, onClose, onRunChange, visible = true, onOpenTerminal }: RunPaneProps) {
  const { run, project, events, approvals, live, error } = useRunDetail(runId, projectId);

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
    <RunView run={run} project={project} events={events} approvals={approvals} live={live} focus={focus} onClose={onClose} onOpenTerminal={onOpenTerminal} />
  );
}

function RunView({
  run,
  project,
  events,
  approvals,
  live,
  focus,
  onClose,
  onOpenTerminal,
}: {
  run: Run;
  project?: Project;
  events: RunEvent[];
  approvals: Approval[];
  live: string;
  focus?: number;
  onClose: () => void;
  onOpenTerminal?: RunPaneProps["onOpenTerminal"];
}) {
  const options = useRunOptions({ model: run.model, effort: run.effort, permission_mode: run.permission_mode, fast_mode: run.fast_mode });
  const busy = BUSY_STATUSES.includes(run.status);
  const subagents = useSubagents(run.id, events, busy);
  const busyNeighbors = useBusyNeighbors(run);
  // 中身を見ているサブエージェント（Task / Agent の呼び出し ID）
  const [subOpen, setSubOpen] = useState<string>();
  const openedSub = subagents.find((s) => s.key === subOpen);
  // 一番下を見ているか（送ったら true に戻し、新しい発言に合わせてスクロールする）
  const stickToBottom = useRef(true);
  const items = useMemo(() => groupEvents(events), [events]);
  const rel = (s: string) => (project ? relativize(s, project.repo_path) : s);
  const waiting = approvals.length > 0;
  // 停止を押して、止まるのを待っている（止まったら戻す）
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    if (!busy) setStopping(false);
  }, [busy]);

  return (
    <OpenSubagentContext.Provider value={setSubOpen}>
    <div className="run-page run-panel">
      <RunHeader run={run} project={project} waiting={waiting} onClose={onClose} onOpenTerminal={onOpenTerminal} />
      <RunTimeline items={items} rel={rel} run={run} busy={busy} waiting={waiting} stopping={stopping} live={live} approvals={approvals} focus={focus} stickToBottom={stickToBottom} />
      <div className="run-composer">
        {/* チャット欄のすぐ上に、このチャットのサブエージェントなどをピルで並べる */}
        <div className="composer-chips">
          <SubagentChip entries={subagents} run={run} models={options.models} onOpen={(s) => setSubOpen(s.key)} />
          {/* 同じ作業場所で、ほかのチャットも作業中なら知らせる（同じファイルを触るとぶつかる） */}
          {busyNeighbors > 0 && (
            <span className="small warn-text">この作業場所では、ほかのチャット {busyNeighbors} 件も作業中です。同じファイルを触ると作業がぶつかることがあります。</span>
          )}
        </div>
        <Composer
          options={options}
          busy={busy}
          placeholder={busy ? "エージェントが作業中です…" : "続けて指示する（Enter で送信、Shift+Enter で改行）"}
          onSend={async (text, attachments) => {
            stickToBottom.current = true;
            await api.sendMessage(run.id, text, options.options, attachments);
          }}
          onStop={() => {
            setStopping(true);
            void api.cancelRun(run.id).catch(() => setStopping(false));
          }}
          trailing={<ContextMeter run={run} />}
          suggestTarget={{ projectId: run.project_id, worktree: run.worktree_path || undefined }}
        />
      </div>
      {openedSub && <SubagentDetail entry={openedSub} events={events} rel={rel} busy={busy} onClose={() => setSubOpen(undefined)} />}
    </div>
    </OpenSubagentContext.Provider>
  );
}
