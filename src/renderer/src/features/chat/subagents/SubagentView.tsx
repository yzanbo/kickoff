import { useEffect, useMemo, useRef } from "react";
import type { ChatEvent } from "@shared/types";
import { formatTokens } from "@/lib/format";
import { subagentReport, type SubagentEntry } from "@shared/chat/subagents";
import { subagentStatusLabel, subagentStatusTitle } from "./subagentList";
import { useTicker } from "@/hooks/useTicker";
import { activityOf, activityText } from "@/features/chat/status/stall";
import { SubagentActions } from "./SubagentActions";
import { relayedText } from "@shared/chat/prompts";
import { groupEvents } from "@/features/chat/timeline/timelineItems";
import { Markdown } from "@/ui/markdown/Markdown";
import { TimelineItems, Working } from "@/features/chat/timeline/Timeline";

/**
 * サブエージェントの中身（親からの依頼・発言・ツールの実行・親への報告）。パネルのタブで開く（SubagentPane）。
 * タブから送った追加の指示（メインのチャットの自分の発言）は、送った時点の位置に自分の発言として出す。
 * 実行中は追記されていき、そのあいだは下までスクロールする
 */
export function SubagentView({
  chatId,
  entry,
  events,
  rel,
  busy,
  onOpen,
}: {
  chatId: number;
  entry: SubagentEntry;
  events: ChatEvent[];
  rel: (s: string) => string;
  busy: boolean;
  /** ほかのサブエージェントの中身を開く（やり直した回へ移る） */
  onOpen?: (key: string) => void;
}) {
  // メインのチャットの、このサブエージェントへの追加の指示を、サブエージェントの流れの自分の発言として混ぜる
  const items = useMemo(() => {
    const agentId = entry.agentId;
    const mixed = agentId
      ? events.map((e) => {
          if (e.type !== "user") return e;
          const text = relayedText(e.data.text, agentId);
          // メインに頼んで伝えた指示は、サブエージェントの流れに自分の発言として混ぜる（parent でこのサブエージェントのものにする）
          return text === undefined ? e : ({ ...e, data: { ...e.data, text, parent: entry.key } } as ChatEvent);
        })
      : events;
    return groupEvents(mixed, entry.key);
  }, [events, entry.key, entry.agentId]);
  const prompt = entry.prompt;
  const resultText = subagentReport(entry, events);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 実行中は、新しい動きに合わせて下までスクロールする
  useEffect(() => {
    const el = bodyRef.current;
    if (el && entry.status === "running") el.scrollTop = el.scrollHeight;
  }, [items.length, entry.status]);

  // 実行中は、最後に動いてからの時間を定期的に描き直す（長く動きがなければ知らせる）
  useTicker(entry.status === "running" ? 15_000 : 3_600_000);
  const activity = entry.status === "running" ? activityOf(entry.lastActivityAt) : null;
  const activityLabel = activity ? activityText(activity, entry.pendingTool) : "";
  const meta = [entry.subagentType ?? "general-purpose", entry.tokens !== undefined ? `${formatTokens(entry.tokens)} tokens` : null, subagentStatusLabel(entry)];

  return (
    <div className="subagent-detail" aria-label={`サブエージェント: ${entry.description}`}>
      <header className="subagent-detail-head">
        <div className="subagent-detail-title">
          <span className="subagent-detail-name">{entry.description}</span>
          <span className="muted small" title={subagentStatusTitle(entry)}>
            {meta.filter(Boolean).join(" · ")}
            {activityLabel && <span className={activity?.level === "stalled" ? "activity-stalled" : undefined}> · {activityLabel}</span>}
          </span>
        </div>
        <SubagentActions chatId={chatId} entry={entry} busy={busy} onOpen={onOpen} />
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
