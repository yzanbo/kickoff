import { useEffect, useMemo, useRef } from "react";
import type { RunEvent } from "../../../../core/types";
import { formatTokens } from "../../format";
import { cleanSubagentReport, SUBAGENT_STATUS_LABELS, type SubagentEntry } from "./subagentList";
import { groupEvents } from "./timelineItems";
import { Markdown } from "../Markdown";
import { TimelineItems, Working } from "./Timeline";

/**
 * サブエージェントの中身（親からの依頼・発言・ツールの実行・親への報告）。パネルのタブで開く（SubagentPane）。
 * 実行中は追記されていき、そのあいだは下までスクロールする
 */
export function SubagentView({ entry, events, rel, busy }: { entry: SubagentEntry; events: RunEvent[]; rel: (s: string) => string; busy: boolean }) {
  const items = useMemo(() => groupEvents(events, entry.key), [events, entry.key]);
  const call = events.find((e) => e.type === "tool_use" && (e.data as { id: string }).id === entry.key);
  const prompt = (call?.data as { input?: { prompt?: string } } | undefined)?.input?.prompt;
  const result = events.find((e) => {
    const d = e.data as { tool_use_id?: string; parent?: string };
    return e.type === "tool_result" && d.tool_use_id === entry.key && !d.parent;
  });
  const rawResult = (result?.data as { content?: string } | undefined)?.content;
  const resultText = rawResult ? cleanSubagentReport(rawResult) : undefined;
  const bodyRef = useRef<HTMLDivElement>(null);

  // 実行中は、新しい動きに合わせて下までスクロールする
  useEffect(() => {
    const el = bodyRef.current;
    if (el && entry.status === "running") el.scrollTop = el.scrollHeight;
  }, [items.length, entry.status]);

  const meta = [entry.subagentType ?? "general-purpose", entry.tokens !== undefined ? `${formatTokens(entry.tokens)} tokens` : null, SUBAGENT_STATUS_LABELS[entry.status]];

  return (
    <div className="subagent-detail" aria-label={`サブエージェント: ${entry.description}`}>
      <header className="subagent-detail-head">
        <div className="subagent-detail-title">
          <span className="subagent-detail-name">{entry.description}</span>
          <span className="muted small">{meta.filter(Boolean).join(" · ")}</span>
        </div>
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
  );
}
