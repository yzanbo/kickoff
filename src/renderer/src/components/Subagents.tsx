import { ChevronUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EFFORT_LABELS, type EffortLevel, type ModelOption, type Run, type RunEvent, type SubagentInfo } from "../../../core/types";
import { useServerEvent } from "../events";
import { modelDisplayName } from "../models";
import { ClaudeMark } from "./RunOptionsBar";
import { formatTokens } from "./ContextMeter";
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
 * チャット欄の下の「サブエージェント N 件」。押すと一覧が開き、行を押すとタイムラインのその呼び出しへ移る
 */
export function SubagentChip({ entries, run, models }: { entries: SubagentEntry[]; run: Run; models: ModelOption[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  if (entries.length === 0) return null;
  const running = entries.filter((s) => s.status === "running").length;
  // 新しいものを上に
  const list = [...entries].reverse();

  const jump = (s: SubagentEntry) => {
    if (s.toolUseEventId === undefined) return;
    const el = document.querySelector<HTMLElement>(`[data-tool-ids~="${s.toolUseEventId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (el instanceof HTMLDetailsElement) el.open = true;
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1200);
    setOpen(false);
  };

  return (
    <div ref={ref} className="subagent-chip-wrap">
      <button type="button" className={`composer-chip ${open ? "open" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {running > 0 && (
          <span className="chip-mark">
            <ClaudeMark size={13} />
          </span>
        )}
        サブエージェント {entries.length} 件{running > 0 && <span className="chip-running">（実行中 {running}）</span>}
        <ChevronUp size={13} className="chip-chevron" aria-hidden />
      </button>
      {open && (
        <div className="subagent-popover" role="dialog" aria-label="サブエージェント">
          {list.map((s) => {
            const meta = [
              s.subagentType ?? "general-purpose",
              modelDisplayName(models, s.model ?? run.model),
              s.model ? null : run.effort ? EFFORT_LABELS[run.effort as EffortLevel] : null,
              s.tokens !== undefined ? `${formatTokens(s.tokens)} tokens` : null,
            ].filter(Boolean);
            return (
              <button key={s.key} type="button" className={`subagent-row status-${s.status}`} onClick={() => jump(s)}>
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
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
