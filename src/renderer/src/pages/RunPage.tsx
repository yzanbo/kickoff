import { Archive, ArchiveRestore, Pencil } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Approval, Project, Run, RunEvent } from "../../../core/types";
import { api } from "../api";
import { CHAT_TITLE_MAX, chatTitle } from "../chatTitle";
import { ApprovalCard } from "../components/ApprovalCard";
import { Composer } from "../components/Composer";
import { ContextMeter } from "../components/ContextMeter";
import { CloseButton, IconButton } from "../components/IconButton";
import { InlineName } from "../components/InlineName";
import { Markdown } from "../components/Markdown";
import { ProjectChip } from "../components/ProjectChip";
import { useRunOptions } from "../components/RunOptionsBar";
import { BUSY_STATUSES, RUN_STATUS_LABELS, RunStatusIcon } from "../components/RunStatus";
import { SectionBadge } from "../components/SectionBadge";
import { WorktreeChip } from "../components/WorktreeChip";
import { SubagentDetail } from "../components/SubagentDetail";
import { SubagentChip, useSubagents } from "../components/Subagents";
import { OpenSubagentContext, TimelineItems, Working } from "../components/Timeline";
import { alertDialog } from "../dialogs";
import { errorMessage } from "../errors";
import { useServerEvent } from "../events";
import { groupEvents, relativize } from "../timeline";

interface RunPageProps {
  projectId: number;
  runId: number;
  /** 検索結果から開いたとき、スクロールして強調する発言（イベント ID） */
  focus?: number;
  /** パネルを閉じる */
  onClose: () => void;
  /** チャットを読み込んだとき・名前やセクションが変わったとき（パネルのタブの名前とアイコンに使う） */
  onRunChange?: (run: Run) => void;
  /** パネルで表示しているか（裏のタブ・閉じたパネルでは false） */
  visible?: boolean;
}

/** エージェントとのチャット（ボードの右側のパネルに出す） */
export function RunPage({ projectId, runId, focus, onClose, onRunChange, visible = true }: RunPageProps) {
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

  // パネルのタブに、チャットの名前とセクションを知らせる（名前を変えたらタブもすぐ変わる）
  const notifyRun = useRef(onRunChange);
  notifyRun.current = onRunChange;
  useEffect(() => {
    if (run) notifyRun.current?.(run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id, run?.title, run?.phase]);

  // 開いて見たので「確認待ち」を消す（パネルに表示したとき・見ている間に作業が終わったとき）。
  // 右クリックの「未読にする」で付けた印は、表示したままでも消さず、次に開くまで残す
  useEffect(() => {
    if (visible && run?.attention) void api.markSeen(run.id).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, run?.id, run?.status]);

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
  // 見出しでチャットの名前を変えている途中か
  const [renaming, setRenaming] = useState(false);
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
          <CloseButton label="パネルを閉じる" title="閉じる（Esc）" size={15} onClick={onClose} />
          <SectionBadge section={run.phase} />
          {renaming ? (
            <InlineName
              initial={run.title}
              maxLength={CHAT_TITLE_MAX}
              className="run-title-input"
              onSubmit={(title) => {
                setRenaming(false);
                void api.renameRun(run.id, title).catch((e: unknown) => alertDialog("名前を変更できませんでした", errorMessage(e)));
              }}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <>
              <h1 title={`${run.title}（ダブルクリックで名前を変更）`} onDoubleClick={() => setRenaming(true)}>
                {chatTitle(run.title)}
              </h1>
              <IconButton icon={Pencil} label="名前を変更" size={13} onClick={() => setRenaming(true)} />
            </>
          )}
          {/* アーカイブ（一覧から隠す。会話の記録は残る）/ 戻す */}
          <IconButton
            icon={run.archived_at ? ArchiveRestore : Archive}
            size={13}
            title={run.archived_at ? "アーカイブから戻す" : "アーカイブ（一覧から隠す。会話の記録は残ります）"}
            label={run.archived_at ? "アーカイブから戻す" : "アーカイブ"}
            onClick={async () => {
              try {
                await api.archiveRun(run.id, !run.archived_at);
              } catch (e) {
                await alertDialog("アーカイブできませんでした", errorMessage(e));
              }
            }}
          />
          {run.archived_at && <span className="archived-chip">アーカイブ済み</span>}
          <span className="spacer" />
          <span className={`run-state state-${waiting ? "waiting" : run.status}`}>
            <RunStatusIcon run={run} waiting={waiting} />
            {RUN_STATUS_LABELS[waiting ? "waiting" : run.status]}
          </span>
        </div>
        <div className="run-sub muted small">
          {/* どのプロジェクトのチャットかが一目でわかるよう、サイドバーと同じ色のバッジにする（押すとそのプロジェクトのカンバン） */}
          {project && <ProjectChip id={project.id} name={project.name} linked />}
          {/* 作業場所（ワークツリー）で作業しているチャット */}
          <WorktreeChip run={run} />
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
              <Markdown streaming>{live}</Markdown>
            </div>
          )}
          {approvals.map((a) => (
            <ApprovalCard key={a.id} approval={a} />
          ))}
          {busy && !waiting && !live && <Working>{run.status === "queued" ? "順番を待っています" : "考えています"}</Working>}
        </div>
      </div>

      <div className="run-composer">
        {/* チャット欄のすぐ上に、このチャットのサブエージェントなどをピルで並べる */}
        <div className="composer-chips">
          <SubagentChip entries={subagents} run={run} models={options.models} onOpen={(s) => setSubOpen(s.key)} />
        </div>
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
      </div>
      {openedSub && <SubagentDetail entry={openedSub} events={events} rel={rel} busy={busy} onClose={() => setSubOpen(undefined)} />}
    </div>
    </OpenSubagentContext.Provider>
  );
}
