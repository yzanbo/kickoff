import { Archive, ArchiveRestore, ChevronRight, Pencil, Wrench, X } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Approval, Attachment, Project, Run, RunEvent } from "../../../core/types";
import { api } from "../api";
import { ApprovalCard, describeToolInput } from "../components/ApprovalCard";
import { AttachmentChip } from "../components/AttachmentChip";
import { Composer } from "../components/Composer";
import { Markdown } from "../components/Markdown";
import { ContextMeter } from "../components/ContextMeter";
import { SubagentChip, useSubagents } from "../components/Subagents";
import { cleanSubagentReport, type SubagentEntry } from "../subagents";
import { useRunOptions } from "../components/RunOptionsBar";
import { BUSY_STATUSES, RUN_STATUS_LABELS, RunStatusIcon } from "../components/RunStatus";
import { SectionBadge } from "../components/SectionBadge";
import { useServerEvent } from "../events";
import { href } from "../router";
import { alertDialog, promptDialog } from "../dialogs";

interface RunPageProps {
  projectId: number;
  runId: number;
  focus?: number;
  /** panel: カンバンの右側に出すパネルとして表示する（閉じる・全画面で開くボタンつき） */
  onClose: () => void;
}

/** エージェントとのチャット（全画面、またはカンバン横のパネル） */
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
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
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
          <h1 title={run.title}>{run.title || "チャット"}</h1>
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
                await alertDialog("アーカイブできませんでした", e instanceof Error ? e.message : String(e));
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
          {items.map((item, i) =>
            item.kind === "tools" ? (
              <ToolGroup key={item.key} tools={item.tools} rel={rel} active={busy && i === items.length - 1} />
            ) : (
              <EventItem key={item.key} event={item.event} />
            ),
          )}
          {live && (
            <div className="assistant live">
              <Markdown>{live}</Markdown>
            </div>
          )}
          {approvals.map((a) => (
            <ApprovalCard key={a.id} approval={a} />
          ))}
          {busy && !waiting && !live && (
            <div className="working">
              <span className="dots" aria-hidden>
                <span />
                <span />
                <span />
              </span>
              {run.status === "queued" ? "順番を待っています" : "考えています"}
            </div>
          )}
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

/** タイムラインの Task / Agent の呼び出しから、そのサブエージェントの中身を開く */
const OpenSubagentContext = createContext<(toolUseId: string) => void>(() => {});

const SUBAGENT_WIDTH_KEY = "kickoff:subagent-width";

const SUB_STATUS_LABELS: Record<SubagentEntry["status"], string> = { running: "実行中", completed: "完了", failed: "失敗", stopped: "中断" };

/**
 * サブエージェントの中身（そのサブエージェントの発言とツールの実行）。チャットの上に重ねて表示し、実行中は追記されていく
 */
function SubagentDetail({
  entry,
  events,
  rel,
  busy,
  onClose,
}: {
  entry: SubagentEntry;
  events: RunEvent[];
  rel: (s: string) => string;
  busy: boolean;
  onClose: () => void;
}) {
  const items = useMemo(() => groupEvents(events, entry.key), [events, entry.key]);
  const call = events.find((e) => e.type === "tool_use" && (e.data as { id: string }).id === entry.key);
  const prompt = (call?.data as { input?: { prompt?: string } } | undefined)?.input?.prompt;
  const result = events.find(
    (e) => e.type === "tool_result" && (e.data as { tool_use_id: string; parent?: string }).tool_use_id === entry.key && !(e.data as { parent?: string }).parent,
  );
  const rawResult = (result?.data as { content?: string } | undefined)?.content;
  const resultText = rawResult ? cleanSubagentReport(rawResult) : undefined;
  const bodyRef = useRef<HTMLDivElement>(null);
  // 引き出しの幅（左端をドラッグして変える。チャットのパネルいっぱいまで広げられる）
  const [width, setWidth] = useState(() => Number(localStorage.getItem(SUBAGENT_WIDTH_KEY)) || 560);
  const [resizing, setResizing] = useState(false);
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const drawer = e.currentTarget.parentElement;
    const panel = drawer?.parentElement;
    if (!drawer || !panel) return;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    setResizing(true);
    const right = panel.getBoundingClientRect().right;
    const max = panel.clientWidth;
    let next = drawer.getBoundingClientRect().width;
    const onMove = (ev: PointerEvent) => {
      next = Math.round(Math.max(320, Math.min(max, right - ev.clientX)));
      drawer.style.width = `${next}px`;
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      setResizing(false);
      setWidth(next);
      localStorage.setItem(SUBAGENT_WIDTH_KEY, String(next));
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  };

  // Esc で閉じる（パネルを閉じる Esc より先に）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // 実行中は、新しい動きに合わせて下までスクロールする
  useEffect(() => {
    const el = bodyRef.current;
    if (el && entry.status === "running") el.scrollTop = el.scrollHeight;
  }, [items.length, entry.status]);

  return (
    <>
    {/* 後ろのチャットは少し暗くして残す（押すと閉じる） */}
    <div className="subagent-backdrop" onClick={onClose} />
    <div
      className={`subagent-detail ${resizing ? "resizing" : ""}`}
      style={{ width: `min(${width}px, 100%)` }}
      role="dialog"
      aria-label={`サブエージェント: ${entry.description}`}
    >
      <div
        className="panel-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="引き出しの幅を変える"
        title="ドラッグで幅を変える"
        onPointerDown={startResize}
      />
      <header className="subagent-detail-head">
        <div className="subagent-detail-title">
          <span className="subagent-detail-name">{entry.description}</span>
          <span className="muted small">
            {[entry.subagentType ?? "general-purpose", entry.tokens !== undefined ? `${Math.round(entry.tokens / 100) / 10}k tokens` : null, SUB_STATUS_LABELS[entry.status]]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <button className="icon-button subagent-detail-close" title="閉じる（Esc）" aria-label="閉じる" onClick={onClose}>
          <X size={15} />
        </button>
      </header>
      <div className="subagent-detail-body timeline" ref={bodyRef}>
        <div className="timeline-inner">
          {prompt && (
            <div className="bubble user subagent-prompt">
              <div className="subagent-label">親のエージェントからの依頼</div>
              <Markdown>{prompt}</Markdown>
            </div>
          )}
          {items.length === 0 && (
            <p className="muted small">
              {entry.status === "running" ? "まだ動きがありません…" : "このサブエージェントの中身は記録されていません（以前のチャットでは残っていません）"}
            </p>
          )}
          {items.map((item, i) =>
            item.kind === "tools" ? (
              <ToolGroup key={item.key} tools={item.tools} rel={rel} active={busy && entry.status === "running" && i === items.length - 1} />
            ) : (
              <EventItem key={item.key} event={item.event} />
            ),
          )}
          {resultText && (
            <div className="subagent-result">
              <div className="subagent-label">親のエージェントへの報告</div>
              <Markdown>{resultText}</Markdown>
            </div>
          )}
          {entry.status === "running" && (
            <div className="working">
              <span className="dots" aria-hidden>
                <span />
                <span />
                <span />
              </span>
              {entry.lastTool ? `${entry.lastTool} を実行中` : "作業中"}
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

// ---- タイムラインの組み立て ----

interface ToolCall {
  use: RunEvent;
  result?: RunEvent;
}

type TimelineItem = { kind: "event"; key: string; event: RunEvent } | { kind: "tools"; key: string; tools: ToolCall[] };

/**
 * 連続するツールの実行を 1 つのまとまりにする（結果は対応する呼び出しにぶら下げる）。
 * parent を渡すとそのサブエージェントの中身だけ、渡さなければ親のエージェントの分だけを並べる
 */
function groupEvents(events: RunEvent[], parent?: string): TimelineItem[] {
  const items: TimelineItem[] = [];
  const byId = new Map<string, ToolCall>();
  for (const e of events) {
    if (((e.data as { parent?: string }).parent ?? undefined) !== parent) continue;
    if (e.type === "tool_use") {
      const call: ToolCall = { use: e };
      byId.set((e.data as { id: string }).id, call);
      const last = items[items.length - 1];
      if (last?.kind === "tools") last.tools.push(call);
      else items.push({ kind: "tools", key: `t${e.id}`, tools: [call] });
    } else if (e.type === "tool_result") {
      const call = byId.get((e.data as { tool_use_id: string }).tool_use_id);
      if (call) call.result = e;
    } else if (e.type === "init" || e.type === "approval" || e.type === "thinking" || e.type === "subagent") {
      // 表示しない（thinking は既定で中身が空。サブエージェントはチャット欄の下の一覧で見せる）
    } else {
      items.push({ kind: "event", key: `e${e.id}`, event: e });
    }
  }
  return items;
}

const TOOL_LABELS: Record<string, string> = {
  Read: "読む",
  Write: "作成",
  Edit: "編集",
  MultiEdit: "編集",
  NotebookEdit: "編集",
  Bash: "コマンド",
  Grep: "検索",
  Glob: "ファイル検索",
  WebSearch: "Web 検索",
  WebFetch: "Web 取得",
  TodoWrite: "ToDo",
  AskUserQuestion: "質問",
  Agent: "サブエージェント",
  Task: "サブエージェント",
  ToolSearch: "ツール検索",
};

function toolLabel(name: string): string {
  if (name.startsWith("mcp__kickoff__")) return "Kickoff";
  return TOOL_LABELS[name] ?? name;
}

/** 表示用にリポジトリの絶対パスを相対パスにする */
function relativize(text: string, repo: string): string {
  return text.split(`${repo}/`).join("").split(repo).join(".");
}

/** ツールのまとまり（閉じた状態では「読む ×2・編集」のように要約する） */
function ToolGroup({ tools, rel, active }: { tools: ToolCall[]; rel: (s: string) => string; active: boolean }) {
  const counts = new Map<string, number>();
  for (const t of tools) {
    const label = toolLabel((t.use.data as { name: string }).name);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const summary = [...counts].map(([label, n]) => (n > 1 ? `${label} ×${n}` : label)).join("・");
  const failed = tools.filter((t) => (t.result?.data as { is_error?: boolean } | undefined)?.is_error).length;
  const last = tools[tools.length - 1];
  const lastData = last.use.data as { name: string; input?: Record<string, unknown> };

  return (
    <details
      className={`tool-group ${failed ? "has-error" : ""} ${active && !last.result ? "active" : ""}`}
      // サブエージェントの一覧から、その呼び出しを含むまとまりへ移れるようにする
      data-tool-ids={tools.map((t) => t.use.id).join(" ")}
    >
      <summary>
        <ChevronRight size={14} className="tool-chevron" />
        <Wrench size={13} className="muted" />
        <span className="tool-summary">{summary}</span>
        {active && !last.result ? (
          <span className="tool-current">{rel(describeToolInput(lastData.name, lastData.input ?? {}))}</span>
        ) : (
          failed > 0 && <span className="tool-failed">{failed} 件失敗</span>
        )}
      </summary>
      <div className="tool-calls">
        {tools.map((t) => (
          <ToolItem key={t.use.id} call={t} rel={rel} />
        ))}
      </div>
    </details>
  );
}

function ToolItem({ call, rel }: { call: ToolCall; rel: (s: string) => string }) {
  const { id, name, input = {} } = call.use.data as { id: string; name: string; input?: Record<string, unknown> };
  const openSubagent = useContext(OpenSubagentContext);
  const r = call.result?.data as { content?: string; is_error?: boolean } | undefined;
  let detail: ReactNode = null;
  if ((name === "Edit" || name === "MultiEdit") && typeof input.old_string === "string") {
    detail = <Diff before={input.old_string} after={String(input.new_string ?? "")} />;
  } else if (name === "Write" && typeof input.content === "string") {
    detail = <Diff before="" after={input.content} maxLines={40} />;
  }
  return (
    <details className={`tool-call ${r?.is_error ? "error" : ""}`}>
      <summary>
        <span className="tool-name">{toolLabel(name)}</span>
        <span className="tool-arg">{rel(describeToolInput(name, input))}</span>
        {!call.result && <span className="spinner small" aria-label="実行中" />}
        {(name === "Agent" || name === "Task") && (
          <button
            type="button"
            className="tool-open-sub"
            onClick={(e) => {
              e.preventDefault();
              openSubagent(id);
            }}
          >
            中身を見る
          </button>
        )}
      </summary>
      {detail}
      {r?.content && (r.is_error || !detail) && (
        <pre className={`tool-output ${r.is_error ? "error" : ""}`}>
          {/* サブエージェントの結果は、Claude Code の前置きを外して報告の本文だけを見せる */}
          {rel(name === "Agent" || name === "Task" ? cleanSubagentReport(r.content) : r.content)}
        </pre>
      )}
    </details>
  );
}

/** 編集内容の表示（削除した行を赤、追加した行を緑で） */
function Diff({ before, after, maxLines = 200 }: { before: string; after: string; maxLines?: number }) {
  const lines = [
    ...(before ? before.split("\n").map((l) => ["-", l] as const) : []),
    ...after.split("\n").map((l) => ["+", l] as const),
  ];
  const shown = lines.slice(0, maxLines);
  return (
    <pre className="diff">
      {shown.map(([sign, line], i) => (
        <span key={i} className={sign === "+" ? "diff-add" : "diff-del"}>
          {sign} {line}
          {"\n"}
        </span>
      ))}
      {lines.length > shown.length && <span className="muted">… ほか {lines.length - shown.length} 行</span>}
    </pre>
  );
}

function EventItem({ event }: { event: RunEvent }) {
  const data = event.data as Record<string, unknown>;
  switch (event.type) {
    case "user": {
      const attachments = (data.attachments as Attachment[] | undefined) ?? [];
      return (
        <div className="bubble user" id={`ev-${event.id}`}>
          {attachments.length > 0 && (
            <div className="bubble-attachments">
              {attachments.map((a) => (
                <AttachmentChip key={a.id} attachment={a} />
              ))}
            </div>
          )}
          {String(data.text ?? "")}
        </div>
      );
    }
    case "text":
      return (
        <div className={`assistant ${data.sub ? "sub" : ""}`} id={`ev-${event.id}`}>
          <Markdown>{String(data.text)}</Markdown>
        </div>
      );
    case "approval_resolved":
      return <div className="event-note">{RESOLVED_LABELS[String(data.action)] ?? "回答済み"}</div>;
    case "result":
      if (data.status === "completed") return null;
      return (
        <div className={`event-note ${data.status === "failed" ? "error" : ""}`}>
          {data.status === "cancelled" ? "中断しました" : `失敗しました: ${String(data.text ?? "")}`}
        </div>
      );
    case "error":
      return <div className="event-note error">{String(data.message)}</div>;
    case "notice":
      return <div className="event-note">{String(data.message)}</div>;
    default:
      return null;
  }
}

const RESOLVED_LABELS: Record<string, string> = {
  allow: "許可しました",
  allow_always: "常に許可しました",
  deny: "拒否しました",
  answer: "質問に回答しました",
};
