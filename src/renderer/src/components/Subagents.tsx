import { Archive, ArchiveRestore, ChevronUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDismiss } from "../hooks/useDismiss";
import { useStoredState } from "../hooks/useStoredState";
import { EFFORT_LABELS, type EffortLevel, type ModelOption, type Run, type RunEvent, type SubagentInfo } from "../../../core/types";
import { useServerEvent } from "../events";
import { modelDisplayName } from "../models";
import { ClaudeMark } from "./ClaudeMark";
import { formatTokens } from "../format";
import { collectSubagents, type SubagentEntry } from "../subagents";

/** チャットのサブエージェントの一覧（途中経過はサーバーからのイベントで受け取る） */
export function useSubagents(runId: number, events: RunEvent[], busy: boolean): SubagentEntry[] {
  const [progress, setProgress] = useState<Record<string, SubagentInfo>>({});
  useEffect(() => setProgress({}), [runId]);
  useServerEvent((e) => {
    if (e.type === "run_subagent" && e.run_id === runId) {
      const key = e.subagent.tool_use_id ?? e.subagent.task_id;
      setProgress((prev) => ({ ...prev, [key]: e.subagent }));
    }
  });
  return collectSubagents(events, progress, busy);
}

const STATUS_LABELS: Record<SubagentInfo["status"], string> = {
  running: "実行中",
  completed: "完了",
  failed: "失敗",
  stopped: "中断",
};

/**
 * チャット欄の下の「サブエージェント N 件」。押すと一覧が開き、行を押すとそのサブエージェントの中身を開く
 */
export function SubagentChip({
  entries,
  run,
  models,
  onOpen,
}: {
  entries: SubagentEntry[];
  run: Run;
  models: ModelOption[];
  onOpen: (entry: SubagentEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // アーカイブしたサブエージェント（チャットごとに覚える。一覧と件数から外す）
  const [archived, saveArchived] = useStoredState(
    `kickoff:subagents-archived:${run.id}`,
    (raw) => new Set(JSON.parse(raw ?? "[]") as string[]),
    (keys) => JSON.stringify([...keys]),
  );
  useDismiss(ref, () => setOpen(false), { enabled: open });

  if (entries.length === 0) return null;
  // 新しいものを上に
  const visible = entries.filter((s) => !archived.has(s.key)).reverse();
  const hidden = entries.filter((s) => archived.has(s.key)).reverse();
  const running = visible.filter((s) => s.status === "running").length;
  const finished = visible.filter((s) => s.status !== "running");

  const archive = (keys: string[]) => saveArchived(new Set([...archived, ...keys]));
  const restore = (key: string) => {
    const next = new Set(archived);
    next.delete(key);
    saveArchived(next);
  };

  const renderRow = (s: SubagentEntry, isArchived: boolean) => {
    const meta = [
      s.subagentType ?? "general-purpose",
      modelDisplayName(models, s.model ?? run.model),
      s.model ? null : run.effort ? EFFORT_LABELS[run.effort as EffortLevel] : null,
      s.tokens !== undefined ? `${formatTokens(s.tokens)} tokens` : null,
    ].filter(Boolean);
    return (
      <div
        key={s.key}
        role="button"
        tabIndex={0}
        className={`subagent-row status-${s.status} ${isArchived ? "archived" : ""}`}
        onClick={() => (onOpen(s), setOpen(false))}
        onKeyDown={(e) => e.key === "Enter" && (onOpen(s), setOpen(false))}
      >
        <span className={`subagent-icon ${s.status === "running" ? "spinning" : ""}`}>
          <ClaudeMark size={16} />
        </span>
        <span className="subagent-text">
          <span className="subagent-title">{s.description}</span>
          <span className="subagent-meta">
            {meta.join(" · ")}
            {s.status !== "completed" && <span className={`subagent-status status-${s.status}`}> · {STATUS_LABELS[s.status]}</span>}
            {s.status === "running" && s.lastTool && <span> · {s.lastTool}</span>}
          </span>
        </span>
        {isArchived ? (
          <button
            type="button"
            className="icon-button subagent-row-action"
            title="一覧に戻す"
            aria-label={`${s.description} を一覧に戻す`}
            onClick={(e) => (e.stopPropagation(), restore(s.key))}
          >
            <ArchiveRestore size={14} />
          </button>
        ) : (
          s.status !== "running" && (
            <button
              type="button"
              className="icon-button subagent-row-action"
              title="アーカイブ"
              aria-label={`${s.description} をアーカイブ`}
              onClick={(e) => (e.stopPropagation(), archive([s.key]))}
            >
              <Archive size={14} />
            </button>
          )
        )}
      </div>
    );
  };

  return (
    <div ref={ref} className="subagent-chip-wrap">
      <button type="button" className={`composer-chip ${open ? "open" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {running > 0 && (
          <span className="chip-mark">
            <ClaudeMark size={13} />
          </span>
        )}
        サブエージェント {visible.length} 件{running > 0 && <span className="chip-running">（実行中 {running}）</span>}
        <ChevronUp size={13} className="chip-chevron" aria-hidden />
      </button>
      {open && (
        <div className="subagent-popover" role="dialog" aria-label="サブエージェント">
          <button type="button" className="subagent-archive-all" disabled={finished.length === 0} onClick={() => archive(finished.map((s) => s.key))}>
            <Archive size={15} aria-hidden />
            完了したサブエージェントをアーカイブ
            {finished.length > 0 && <span className="muted">（{finished.length} 件）</span>}
          </button>
          {visible.length === 0 && <p className="muted small subagent-empty">表示中のサブエージェントはありません</p>}
          {visible.map((s) => renderRow(s, false))}
          {hidden.length > 0 && (
            <>
              <button type="button" className="subagent-archived-toggle" onClick={() => setShowArchived(!showArchived)}>
                {showArchived ? "アーカイブ済みを隠す" : `アーカイブ済み ${hidden.length} 件を表示`}
              </button>
              {showArchived && hidden.map((s) => renderRow(s, true))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
