import { Archive, ArchiveRestore, ChevronUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EFFORT_LABELS, type EffortLevel, type ModelOption, type Run, type RunEvent, type SubagentInfo } from "../../../../core/types";
import { useServerEvent } from "../../events";
import { formatTokens } from "../../format";
import { useDismiss } from "../../hooks/useDismiss";
import { useStoredState } from "../../hooks/useStoredState";
import { subagentsArchivedKey } from "../../storageKeys";
import { modelDisplayName } from "../../models";
import { collectSubagents, SUBAGENT_STATUS_LABELS, type SubagentEntry } from "./subagentList";
import { ClaudeMark } from "../ClaudeMark";
import { IconButton } from "../IconButton";

/** チャットのサブエージェントの一覧（途中経過はサーバーからのイベントで受け取る） */
export function useSubagents(runId: number, events: RunEvent[], busy: boolean): SubagentEntry[] {
  const [progress, setProgress] = useState<Record<string, SubagentInfo>>({});
  useEffect(() => setProgress({}), [runId]);
  useServerEvent((e) => {
    if (e.type === "run_subagent" && e.run_id === runId) {
      // 作業 ID ごとに覚える（再開すると呼び出し ID が変わるため。行へのまとめ方は collectSubagents が決める）
      setProgress((prev) => ({ ...prev, [e.subagent.task_id]: e.subagent }));
    }
  });
  return collectSubagents(events, progress, busy);
}


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
    subagentsArchivedKey(run.id),
    (raw) => new Set(JSON.parse(raw ?? "[]") as string[]),
    (keys) => JSON.stringify([...keys]),
  );
  useDismiss(ref, () => setOpen(false), { enabled: open });

  if (entries.length === 0) return null;
  // 新しいものを上に
  const visible = entries.filter((s) => !archived.has(s.key)).reverse();
  const hidden = entries.filter((s) => archived.has(s.key)).reverse();
  const running = visible.filter((s) => s.status === "running").length;
  const failed = visible.filter((s) => s.status === "failed").length;
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
            {s.status !== "completed" && <span className={`subagent-status status-${s.status}`}> · {SUBAGENT_STATUS_LABELS[s.status]}</span>}
            {s.status === "running" && s.lastTool && <span> · {s.lastTool}</span>}
          </span>
        </span>
        {isArchived ? (
          <IconButton
            icon={ArchiveRestore}
            label={`${s.description} を一覧に戻す`}
            title="一覧に戻す"
            className="subagent-row-action"
            type="button"
            onClick={(e) => (e.stopPropagation(), restore(s.key))}
          />
        ) : (
          s.status !== "running" && (
            <IconButton
              icon={Archive}
              label={`${s.description} をアーカイブ`}
              title="アーカイブ"
              className="subagent-row-action"
              type="button"
              onClick={(e) => (e.stopPropagation(), archive([s.key]))}
            />
          )
        )}
      </div>
    );
  };

  return (
    <div ref={ref} className="chip-wrap">
      <button type="button" className={`composer-chip ${open ? "open" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {running > 0 && (
          <span className="chip-mark">
            <ClaudeMark size={13} />
          </span>
        )}
        {visible.length > 0 ? `サブエージェント ${visible.length} 件` : `アーカイブ済みのサブエージェント ${hidden.length} 件`}
        {running > 0 && <span className="chip-running"> · {running} 件実行中</span>}
        {failed > 0 && <span className="chip-failed"> · {failed} 件失敗</span>}
        <ChevronUp size={13} className="chip-chevron" aria-hidden />
      </button>
      {open && (
        <div className="chip-popover" role="dialog" aria-label="サブエージェント">
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
