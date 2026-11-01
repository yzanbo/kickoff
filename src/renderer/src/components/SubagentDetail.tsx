import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { RunEvent } from "../../../core/types";
import { cx } from "../cx";
import { startHorizontalDrag } from "../hooks/dragResize";
import { useDismiss } from "../hooks/useDismiss";
import { useStoredNumber } from "../hooks/useStoredState";
import { cleanSubagentReport, type SubagentEntry } from "../subagents";
import { groupEvents } from "../timeline";
import { Markdown } from "./Markdown";
import { TimelineItems, Working } from "./Timeline";

const WIDTH_KEY = "kickoff:subagent-width";
const MIN_WIDTH = 320;

const STATUS_LABELS: Record<SubagentEntry["status"], string> = { running: "実行中", completed: "完了", failed: "失敗", stopped: "中断" };

/**
 * サブエージェントの中身（親からの依頼・発言・ツールの実行・親への報告）。
 * チャットの右からふわっと出る引き出しで、左端をドラッグして幅を変えられる。実行中は追記されていく
 */
export function SubagentDetail({
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
  const result = events.find((e) => {
    const d = e.data as { tool_use_id?: string; parent?: string };
    return e.type === "tool_result" && d.tool_use_id === entry.key && !d.parent;
  });
  const rawResult = (result?.data as { content?: string } | undefined)?.content;
  const resultText = rawResult ? cleanSubagentReport(rawResult) : undefined;
  const drawerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // 引き出しの幅（チャットのパネルいっぱいまで広げられる）
  const [width, setWidth] = useStoredNumber(WIDTH_KEY, 560);
  const [resizing, setResizing] = useState(false);

  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drawer = drawerRef.current;
    const panel = drawer?.parentElement;
    if (!drawer || !panel) return;
    const right = panel.getBoundingClientRect().right;
    const max = panel.clientWidth;
    let next = drawer.getBoundingClientRect().width;
    setResizing(true);
    startHorizontalDrag(e, {
      move: (clientX) => {
        next = Math.round(Math.max(MIN_WIDTH, Math.min(max, right - clientX)));
        drawer.style.width = `${next}px`;
      },
      end: () => {
        setResizing(false);
        setWidth(next);
      },
    });
  };

  // Esc で閉じる（パネルを閉じる Esc より先に）。外側（暗い部分）を押したときは、その要素で閉じる
  useDismiss(drawerRef, onClose, { outside: false });

  // 実行中は、新しい動きに合わせて下までスクロールする
  useEffect(() => {
    const el = bodyRef.current;
    if (el && entry.status === "running") el.scrollTop = el.scrollHeight;
  }, [items.length, entry.status]);

  const meta = [entry.subagentType ?? "general-purpose", entry.tokens !== undefined ? `${Math.round(entry.tokens / 100) / 10}k tokens` : null, STATUS_LABELS[entry.status]];

  return (
    <>
      {/* 後ろのチャットは少し暗くして残す（押すと閉じる） */}
      <div className="subagent-backdrop" onClick={onClose} />
      <div
        ref={drawerRef}
        className={cx("subagent-detail", resizing && "resizing")}
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
            <span className="muted small">{meta.filter(Boolean).join(" · ")}</span>
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
            <TimelineItems items={items} rel={rel} active={busy && entry.status === "running"} />
            {resultText && (
              <div className="subagent-result">
                <div className="subagent-label">親のエージェントへの報告</div>
                <Markdown>{resultText}</Markdown>
              </div>
            )}
            {entry.status === "running" && <Working>{entry.lastTool ? `${entry.lastTool} を実行中` : "作業中"}</Working>}
          </div>
        </div>
      </div>
    </>
  );
}
