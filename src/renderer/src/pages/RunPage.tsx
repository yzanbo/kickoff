import { useEffect, useMemo, useRef, useState } from "react";
import { PHASE_LABELS, type Approval, type Run, type RunEvent, type RunStatus } from "../../../core/types";
import { api } from "../api";
import { ApprovalCard, describeToolInput } from "../components/ApprovalCard";
import { Composer } from "../components/Composer";
import { Markdown } from "../components/Markdown";
import { useRunOptions } from "../components/RunOptionsBar";
import { useServerEvent } from "../events";
import { href } from "../router";

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  queued: "待機中",
  running: "作業中",
  waiting: "回答待ち",
  completed: "完了",
  failed: "失敗",
  cancelled: "中断",
};

const BUSY: RunStatus[] = ["queued", "running", "waiting"];

/** エージェントとの会話（1 つの実行） */
export function RunPage({ projectId, runId }: { projectId: number; runId: number }) {
  const [run, setRun] = useState<Run>();
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [error, setError] = useState<string>();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRun(undefined);
    setEvents([]);
    api
      .run(runId)
      .then((d) => {
        setRun(d.run);
        setEvents(d.events);
        setApprovals(d.approvals);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [runId]);

  useServerEvent((e) => {
    if (e.type === "run_event" && e.event.run_id === runId) {
      setEvents((prev) => (prev.some((x) => x.id === e.event.id) ? prev : [...prev, e.event]));
    } else if (e.type === "run" && e.run.id === runId) {
      setRun(e.run);
    } else if (e.type === "approval" && e.approval.run_id === runId) {
      setApprovals((prev) => [...prev, e.approval]);
    } else if (e.type === "approval_resolved" && e.run_id === runId) {
      setApprovals((prev) => prev.filter((a) => a.id !== e.id));
    }
  });

  // 新しい発言が来たら下までスクロールする
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [events.length, approvals.length]);

  if (error) return <div className="page error">{error}</div>;
  if (!run) return <div className="page muted">読み込み中…</div>;

  return <RunView run={run} events={events} approvals={approvals} projectId={projectId} bottomRef={bottomRef} />;
}

function RunView({
  run,
  events,
  approvals,
  projectId,
  bottomRef,
}: {
  run: Run;
  events: RunEvent[];
  approvals: Approval[];
  projectId: number;
  bottomRef: React.RefObject<HTMLDivElement | null>;
}) {
  const options = useRunOptions({ model: run.model, effort: run.effort, permission_mode: run.permission_mode });
  const busy = BUSY.includes(run.status);
  const results = useMemo(() => {
    const map = new Map<string, RunEvent>();
    for (const e of events) if (e.type === "tool_result") map.set((e.data as { tool_use_id: string }).tool_use_id, e);
    return map;
  }, [events]);

  return (
    <div className="run-page">
      <header className="run-header">
        <a className="muted small" href={href({ name: "section", projectId, section: run.phase })}>
          ← {PHASE_LABELS[run.phase]}
        </a>
        <div className="run-title-row">
          <h1>{run.title || "チャット"}</h1>
          <button
            className="icon-button"
            title="名前を変更"
            aria-label="名前を変更"
            onClick={async () => {
              const title = prompt("チャットの名前", run.title)?.trim();
              if (title && title !== run.title) await api.renameRun(run.id, title);
            }}
          >
            ✎
          </button>
          <span className={`status-chip status-${run.status}`}>{RUN_STATUS_LABELS[run.status]}</span>
        </div>
        <div className="muted small">
          {run.num_turns > 0 && `${run.num_turns} ターン`}
          {run.cost_usd > 0 && ` ・ API 換算 $${run.cost_usd.toFixed(2)}`}
        </div>
      </header>

      <div className="timeline">
        {events.map((e) => (
          <EventItem key={e.id} event={e} result={e.type === "tool_use" ? results.get((e.data as { id: string }).id) : undefined} />
        ))}
        {approvals.map((a) => (
          <ApprovalCard key={a.id} approval={a} />
        ))}
        {busy && approvals.length === 0 && (
          <div className="working">
            <span className="spinner" aria-hidden /> {run.status === "queued" ? "順番を待っています…" : "作業中…"}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="run-composer">
        <Composer
          options={options}
          busy={busy}
          onSend={async (text) => {
            await api.sendMessage(run.id, text, options.options);
          }}
          onStop={() => void api.cancelRun(run.id)}
        />
      </div>
    </div>
  );
}

function EventItem({ event, result }: { event: RunEvent; result?: RunEvent }) {
  const data = event.data as Record<string, unknown>;
  switch (event.type) {
    case "user":
      return <div className="bubble user">{String(data.text)}</div>;
    case "text":
      return (
        <div className={`bubble assistant ${data.sub ? "sub" : ""}`}>
          <Markdown>{String(data.text)}</Markdown>
        </div>
      );
    case "thinking":
      return (
        <details className="thinking">
          <summary>考えた内容</summary>
          <div className="prewrap small">{String(data.text)}</div>
        </details>
      );
    case "tool_use":
      return <ToolItem name={String(data.name)} input={(data.input ?? {}) as Record<string, unknown>} result={result} />;
    case "approval_resolved":
      return <div className="event-note">{RESOLVED_LABELS[String(data.action)] ?? "回答済み"}</div>;
    case "result":
      return (
        <div className={`event-result ${data.status === "completed" ? "" : "error"}`}>
          {data.status === "completed" ? "✓ 完了" : data.status === "cancelled" ? "■ 中断しました" : `✕ 失敗: ${String(data.text ?? "")}`}
        </div>
      );
    case "error":
      return <div className="event-result error">✕ {String(data.message)}</div>;
    case "notice":
      return <div className="event-note">{String(data.message)}</div>;
    default:
      // init・approval・tool_result は他の表示に含める
      return null;
  }
}

const RESOLVED_LABELS: Record<string, string> = {
  allow: "✓ 許可しました",
  allow_always: "✓ 常に許可しました",
  deny: "✕ 拒否しました",
  answer: "✓ 質問に回答しました",
};

/** ツールの実行（1 行で表示し、開くと入力と結果が見える） */
function ToolItem({ name, input, result }: { name: string; input: Record<string, unknown>; result?: RunEvent }) {
  const r = result?.data as { content?: string; is_error?: boolean } | undefined;
  const label = name.replace(/^mcp__kickoff__/, "Kickoff: ");
  return (
    <details className={`tool ${r?.is_error ? "tool-error" : ""}`}>
      <summary>
        <span className="tool-name">{label}</span>
        <span className="tool-arg">{describeToolInput(name, input)}</span>
        {!result && <span className="spinner small" aria-label="実行中" />}
      </summary>
      <pre className="tool-detail">{JSON.stringify(input, null, 2)}</pre>
      {r?.content && <pre className="tool-detail">{r.content}</pre>}
    </details>
  );
}
