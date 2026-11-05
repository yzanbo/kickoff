import { ChevronRight } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import type { ChatEvent } from "@shared/types";
import { isSubagentTool, subagentReport, type SubagentEntry } from "@shared/chat/subagents";
import { relayedText } from "@shared/chat/prompts";
import { cx } from "@/lib/cx";
import { formatTokens } from "@/lib/format";
import { formatElapsed, formatFullStamp, formatRunTime, formatStampRange, formatStampRangeWithRunTime } from "@/lib/time";
import { Markdown } from "@/ui/markdown/Markdown";
import { activityOf, activityText } from "@/features/chat/status/stall";
import { Working } from "@/features/chat/status/Working";
import { groupEvents, type TimelineItem } from "@/features/chat/timeline/timelineItems";
import { describeTool } from "@/features/chat/tools/toolDescribe";
import { showsSubagentStatus } from "./subagentList";
import type { SubagentsView } from "./subagentsContext";
import { latestActivity, scopeOf } from "./subagentTree";

/*
 * サブエージェントの見せ方の部品（流れの中のカード SubagentCard と、右の欄のサブエージェントの画面 SubagentScreen で共通）:
 * 開始〜終了の時刻・いまの動き・終わったもののまとめ・親からの依頼・手順（発言・ツール・入れ子のカード・作業中の行）・親への報告
 */

/** サブエージェントの手順の流れを描く（TimelineItems。流れの部品をここから読むと輪になるので、描く側から渡す） */
export type RenderItems = (items: TimelineItem[], active: boolean) => ReactNode;

/** 開始〜終了の時刻と実行時間（実行中は開始〜最後の動き）。今日なら時刻だけ、別の日なら日付も。乗せると年月日とかかった時間 */
export function SubagentTime({ entry }: { entry: SubagentEntry }) {
  const start = entry.startedAt;
  if (!start) return null;
  const running = entry.status === "running";
  const end = running ? (entry.lastActivityAt ?? start) : (entry.endedAt ?? entry.lastActivityAt ?? start);
  const title = running
    ? `開始 ${formatFullStamp(start)}\n最後の動き ${formatFullStamp(end)}（実行中）`
    : `開始 ${formatFullStamp(start)}\n終了 ${formatFullStamp(end)}（実行時間 ${formatRunTime(Date.parse(end) - Date.parse(start))}）`;
  return (
    <span className={cx("tool-time", running && "running")} title={title}>
      {running ? formatStampRange(start, end) : formatStampRangeWithRunTime(start, end)}
    </span>
  );
}

/** 実行中のいまの動き（いちばん新しいツールの呼び出し。子孫のものは「洗い出し › 検索: …」）と、最後の動きからの時間・トークン数 */
export function NowLine({ entry, view, rel }: { entry: SubagentEntry; view: SubagentsView; rel: (s: string) => string }) {
  const latest = useMemo(() => latestActivity(view.tree, entry.key, view.events), [view.tree, entry.key, view.events]);
  // いちばん新しいのが入れ子のサブエージェントの起動で、その子の中の記録が届かないとき（孫の中の手順は Claude Code が送らない）は、
  // 子の途中経過（最後のツール）を出す
  const child = latest && isSubagentTool(latest.use.data.name) ? view.tree.byKey.get(latest.use.data.id) : undefined;
  const what =
    child?.status === "running" && child.lastTool
      ? `${latest?.by ? `${latest.by.description} › ` : ""}${child.description} › ${child.lastTool}`
      : latest
        ? `${latest.by ? `${latest.by.description} › ` : ""}${describeTool(latest.use.data.name, (latest.use.data.input ?? {}) as Record<string, unknown>)}`
        : (entry.lastTool ?? "準備しています");
  const activity = activityOf(entry.lastActivityAt);
  const note = activityText(activity, entry.pendingTool);
  return (
    <span className="subagent-card-what">
      <span className="subagent-card-label">いま</span>
      <span className="subagent-card-activity" title={rel(what)}>
        {rel(what)}
      </span>
      {note && <span className={activity.level === "stalled" ? "activity-stalled" : undefined}>{note}</span>}
      {entry.tokens !== undefined && <span className="subagent-card-count">{formatTokens(entry.tokens)} tokens</span>}
    </span>
  );
}

/** 終わったサブエージェントのまとめ（完了・ツールの回数・トークン数・かかった時間・中で起動したサブエージェントの数） */
export function Summary({ entry, childCount }: { entry: SubagentEntry; childCount: number }) {
  const end = entry.endedAt ?? entry.lastActivityAt;
  const duration = entry.durationMs ?? (entry.startedAt && end ? Date.parse(end) - Date.parse(entry.startedAt) : undefined);
  const parts = [
    // 状態の文が見出しにあるもの（失敗・中断・受け取り待ちなど）は重ねない
    showsSubagentStatus(entry) ? null : "完了",
    entry.toolUses !== undefined ? `ツール ${entry.toolUses} 回` : null,
    entry.tokens !== undefined ? `${formatTokens(entry.tokens)} tokens` : null,
    duration !== undefined ? formatElapsed(duration) : null,
    childCount > 0 ? `サブエージェント ${childCount} 件` : null,
  ].filter(Boolean);
  return <span className="subagent-card-what muted">{parts.join(" · ")}</span>;
}

/**
 * サブエージェントの手順の項目（そのサブエージェントの記録だけを、メインと同じまとめ方で）。チャット欄・右の欄の入力欄から伝えた
 * 追加の指示（メインのチャットの自分の発言）は、このサブエージェントの流れに自分の発言として混ぜる
 */
export function useSubagentItems(entry: SubagentEntry, view: SubagentsView): TimelineItem[] {
  const { key, agentId } = entry;
  const scopeKey = scopeOf(entry).join(" ");
  return useMemo(() => {
    const mixed = agentId
      ? view.events.map((e) => {
          if (e.type !== "user") return e;
          const text = relayedText(e.data.text, agentId);
          return text === undefined ? e : ({ ...e, data: { ...e.data, text, parent: key } } as ChatEvent);
        })
      : view.events;
    return groupEvents(mixed, scopeKey.split(" "));
  }, [view.events, key, agentId, scopeKey]);
}

/** 手順（発言・ツール・入れ子のカード）と、実行中なら作業中の行。中身の記録がなければ、その理由 */
export function SubagentSteps({ entry, view, items, renderItems }: { entry: SubagentEntry; view: SubagentsView; items: TimelineItem[]; renderItems: RenderItems }) {
  const running = entry.status === "running";
  return (
    <>
      {items.length === 0 && <p className="muted small">{emptyText(entry, running)}</p>}
      {renderItems(items, view.busy && running)}
      {running && <Working>{workingText(entry)}</Working>}
    </>
  );
}

/** 親のエージェントへの報告（まだなければ出さない） */
export function SubagentReport({ entry, view }: { entry: SubagentEntry; view: SubagentsView }) {
  const report = subagentReport(entry, view.events);
  if (!report) return null;
  return (
    <div className="subagent-result">
      <div className="subagent-label">親のエージェントへの報告</div>
      <Markdown>{report}</Markdown>
    </div>
  );
}

/**
 * 中身の記録がないときの文。サブエージェントの中で起動したサブエージェント（孫より深いもの）の中の手順は Claude Code が送ってこないので、
 * その旨と、届くもの（最後のツール・回数・報告）を伝える
 */
function emptyText(entry: SubagentEntry, running: boolean): string {
  if (entry.parentKey !== undefined)
    return "サブエージェントの中で起動したサブエージェントの途中の手順は、Claude Code が送ってこないため出せません（実行中の最後のツール・ツールの回数・トークン数・報告は出ます）";
  return running ? "まだ動きがありません…" : "このサブエージェントの中身は記録されていません";
}

/** 実行中のカードの中身の最後の行（子の結果を待っている・ツールを実行中・作業中） */
function workingText(entry: SubagentEntry): string {
  const tool = entry.pendingTool ?? entry.lastTool;
  if (tool && isSubagentTool(tool)) return "中で起動したサブエージェントの終わりを待っています";
  return tool ? `${tool} を実行中` : "作業中";
}

/** 親のエージェントからの依頼（初めは 1 行にたたみ、開くと全文） */
export function SubagentPrompt({ text }: { text: string }) {
  const first = text.split("\n").find((line) => line.trim()) ?? "";
  return (
    <details className="subagent-prompt">
      <summary>
        <ChevronRight size={13} className="tool-chevron" />
        <span className="subagent-label">親のエージェントからの依頼</span>
        <span className="subagent-prompt-first">{first}</span>
      </summary>
      <div className="subagent-prompt-body">
        <Markdown>{text}</Markdown>
      </div>
    </details>
  );
}
