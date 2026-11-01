import { Archive, ArchiveRestore, Pencil, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Approval, Project, Run, RunEvent } from "../../../core/types";
import { api } from "../api";
import { chatTitle } from "../chatTitle";
import { ApprovalCard } from "../components/ApprovalCard";
import { Composer } from "../components/Composer";
import { ContextMeter } from "../components/ContextMeter";
import { Markdown } from "../components/Markdown";
import { useRunOptions } from "../components/RunOptionsBar";
import { BUSY_STATUSES, RUN_STATUS_LABELS, RunStatusIcon } from "../components/RunStatus";
import { SectionBadge } from "../components/SectionBadge";
import { SubagentDetail } from "../components/SubagentDetail";
import { SubagentChip, useSubagents } from "../components/Subagents";
import { OpenSubagentContext, TimelineItems, Working } from "../components/Timeline";
import { alertDialog, promptDialog } from "../dialogs";
import { errorMessage } from "../errors";
import { useServerEvent } from "../events";
import { href } from "../router";
import { groupEvents, relativize } from "../timeline";

interface RunPageProps {
  projectId: number;
  runId: number;
  /** 検索結果から開いたとき、スクロールして強調する発言（イベント ID） */
  focus?: number;
  /** パネルを閉じる */
  onClose: () => void;
}

/** エージェントとのチャット（ボードの右側のパネルに出す） */
export function RunPage({ projectId, runId, focus, onClose }: RunPageProps) {
  const [run, setRun] = useState<Run>();
  const [project, setProject] = useState<Project>();
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  // 生成中の返答（確定すると text イベントとして届くので、そこで消す）
  const [live, setLive] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    setRun(undefined);
    setEvents([]);
    setLive("");
    api
      .run(runId)
      .then((d) => {
        setRun(d.run);
        setEvents(d.events);
        setApprovals(d.approvals);
      })
      .catch((e: unknown) => setError(errorMessage(e)));
    api.project(projectId).then(setProject).catch(() => {});
  }, [runId, projectId]);

  // 開いて見たので「確認待ち」を消す（見ている間に終わった場合も同じ）
  useEffect(() => {
    if (run?.attention) void api.markSeen(run.id).catch(() => {});
  }, [run?.id, run?.attention]);

  useServerEvent((e) => {
    if (e.type === "run_delta" && e.run_id === runId) {
      setLive((prev) => prev + e.text);
    } else if (e.type === "run_event" && e.event.run_id === runId) {
      setEvents((prev) => (prev.some((x) => x.id === e.event.id) ? prev : [...prev, e.event]));
      if (e.event.type !== "user") setLive("");
    } else if (e.type === "run" && e.run.id === runId) {
      setRun(e.run);
      if (!BUSY_STATUSES.includes(e.run.status)) setLive("");
    } else if (e.type === "approval" && e.approval.run_id === runId) {
      setApprovals((prev) => [...prev, e.approval]);
    } else if (e.type === "approval_resolved" && e.run_id === runId) {
      setApprovals((prev) => prev.filter((a) => a.id !== e.id));
    }
  });

  if (error) return <div className="page error">{error}</div>;
  if (!run) return <div className="page muted">読み込み中…</div>;
  return (
    <RunView run={run} project={project} events={events} approvals={approvals} live={live} focus={focus} onClose={onClose} />
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
}: {
  run: Run;
  project?: Project;
  events: RunEvent[];
  approvals: Approval[];
  live: string;
  focus?: number;
  onClose: () => void;
}) {
  const options = useRunOptions(
    { model: run.model, effort: run.effort, permission_mode: run.permission_mode, fast_mode: Boolean(run.fast_mode) },
    run.phase,
  );
  const busy = BUSY_STATUSES.includes(run.status);
  const subagents = useSubagents(run.id, events, busy);
  // 中身を見ているサブエージェント（Task / Agent の呼び出し ID）
  const [subOpen, setSubOpen] = useState<string>();
  const openedSub = subagents.find((s) => s.key === subOpen);
  const timelineRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const items = useMemo(() => groupEvents(events), [events]);
  const rel = (s: string) => (project ? relativize(s, project.repo_path) : s);
  const waiting = approvals.length > 0;

  // 検索結果から開いたときは、その発言までスクロールして一瞬強調する
  useEffect(() => {
    if (!focus) return;
    const target = document.getElementById(`ev-${focus}`);
    if (!target) return;
    stickToBottom.current = false;
    target.scrollIntoView({ block: "center" });
    target.classList.remove("flash");
    void target.offsetWidth; // アニメーションをやり直すため
    target.classList.add("flash");
  }, [focus, items.length]);

  // 一番下を見ているときだけ、新しい発言に合わせてスクロールする
  useEffect(() => {
    const el = timelineRef.current;
    if (el && stickToBottom.current && !focus) el.scrollTop = el.scrollHeight;
  }, [items.length, approvals.length, live, focus]);

  return (
    <OpenSubagentContext.Provider value={setSubOpen}>
    <div className="run-page run-panel">
      <header className="run-header">
        <div className="run-title-row">
          <button className="icon-button" title="閉じる（Esc）" aria-label="パネルを閉じる" onClick={onClose}>
            <X size={15} />
          </button>
          <SectionBadge section={run.phase} />
          <h1 title={run.title}>{chatTitle(run.title)}</h1>
          <button
            className="icon-button"
            title="名前を変更"
            aria-label="名前を変更"
            onClick={async () => {
              const title = await promptDialog({ title: "チャットの名前を変更", initial: run.title, confirmLabel: "変更" });
              if (title && title !== run.title) await api.renameRun(run.id, title);
            }}
          >
            <Pencil size={13} />
          </button>
          {/* アーカイブ（一覧から隠す。会話の記録は残る）/ 戻す */}
          <button
            className="icon-button"
            title={run.archived_at ? "アーカイブから戻す" : "アーカイブ（一覧から隠す。会話の記録は残ります）"}
            aria-label={run.archived_at ? "アーカイブから戻す" : "アーカイブ"}
            onClick={async () => {
              try {
                await api.archiveRun(run.id, !run.archived_at);
              } catch (e) {
                await alertDialog("アーカイブできませんでした", errorMessage(e));
              }
            }}
          >
            {run.archived_at ? <ArchiveRestore size={13} /> : <Archive size={13} />}
          </button>
          {run.archived_at && <span className="archived-chip">アーカイブ済み</span>}
          <span className="spacer" />
          <span className={`run-state state-${waiting ? "waiting" : run.status}`}>
            <RunStatusIcon run={run} waiting={waiting} />
            {RUN_STATUS_LABELS[waiting ? "waiting" : run.status]}
          </span>
        </div>
        <div className="run-sub muted small">
          {project && <a href={href({ name: "project", id: project.id, tab: "board" })}>{project.name}</a>}
          {run.num_turns > 0 && <span>{run.num_turns} ターン</span>}
          {run.cost_usd > 0 && (
            <span title="サブスクリプション利用時も API 料金に換算した参考値">API 換算 ${run.cost_usd.toFixed(2)}</span>
          )}
        </div>
      </header>

      <div
        className="timeline"
        ref={timelineRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        <div className="timeline-inner">
          <TimelineItems items={items} rel={rel} active={busy} />
          {live && (
            <div className="assistant live">
              <Markdown>{live}</Markdown>
            </div>
          )}
          {approvals.map((a) => (
            <ApprovalCard key={a.id} approval={a} />
          ))}
          {busy && !waiting && !live && <Working>{run.status === "queued" ? "順番を待っています" : "考えています"}</Working>}
        </div>
      </div>

      <div className="run-composer">
        <Composer
          options={options}
          busy={busy}
          placeholder={busy ? "エージェントが作業中です…" : "続けて指示する（Enter で送信、Shift+Enter で改行）"}
          onSend={async (text, attachments) => {
            stickToBottom.current = true;
            await api.sendMessage(run.id, text, options.options, attachments);
          }}
          onStop={() => void api.cancelRun(run.id)}
          trailing={<ContextMeter run={run} />}
        />
        <div className="composer-chips">
          <SubagentChip entries={subagents} run={run} models={options.models} onOpen={(s) => setSubOpen(s.key)} />
        </div>
      </div>
      {openedSub && <SubagentDetail entry={openedSub} events={events} rel={rel} busy={busy} onClose={() => setSubOpen(undefined)} />}
    </div>
    </OpenSubagentContext.Provider>
  );
}
