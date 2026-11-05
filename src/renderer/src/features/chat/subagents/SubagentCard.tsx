import { ChevronRight, Reply } from "lucide-react";
import { memo, useMemo, type KeyboardEvent, type ReactNode } from "react";
import type { ChatEvent, ChatEventOf } from "@shared/types";
import { isSubagentTool, subagentReport, type SubagentEntry } from "@shared/chat/subagents";
import { relayedText } from "@shared/chat/prompts";
import { cx } from "@/lib/cx";
import { formatTokens } from "@/lib/format";
import { formatElapsed, formatFullStamp, formatStamp, formatStampRange } from "@/lib/time";
import { useTicker } from "@/hooks/useTicker";
import { ClaudeMark } from "@/ui/ClaudeMark";
import { Markdown } from "@/ui/markdown/Markdown";
import { useChatPaneState, useOptionalChatPane } from "@/features/chat/pane/chatPaneContext";
import { activityOf, activityText } from "@/features/chat/status/stall";
import { Working } from "@/features/chat/status/Working";
import { groupEvents, type TimelineItem, type ToolCall } from "@/features/chat/timeline/timelineItems";
import { describeTool } from "@/features/chat/tools/toolDescribe";
import { SubagentActions } from "./SubagentActions";
import { showsSubagentStatus, subagentStatusClass, subagentStatusLabel, subagentStatusTitle } from "./subagentList";
import { useSubagentsView, type SubagentsView } from "./subagentsContext";
import { childrenOf, latestActivity, pathOf, scopeOf } from "./subagentTree";

/** カードの中身の流れを描く（TimelineItems。流れの部品をここから読むと輪になるので、描く側から渡す） */
export type RenderItems = (items: TimelineItem[], active: boolean) => ReactNode;

/** 字下げをやめる深さ（これより深い入れ子は字下げせず、見出しに外側からの道筋を添える） */
const FLAT_DEPTH = 3;

interface CardProps {
  call: ToolCall;
  rel: (s: string) => string;
  renderItems: RenderItems;
}

/**
 * 流れの中のサブエージェントのカード（Agent / Task の呼び出し 1 つ）。閉じた状態でも、状態・名前・開始〜終了（実行中は開始〜最後の動き）・
 * いまの動き（中で起動したサブエージェントのものも）・操作を出す。開くと、そのサブエージェントの流れ（依頼 → 発言・ツール（時刻付き）→ 報告）を
 * 字下げして出し、中で起動したサブエージェントも同じカードとして入れ子で出す。開閉はチャットの画面の状態（ピルから移ったときも開く）
 */
function SubagentCardView({ call, rel, renderItems }: CardProps) {
  const view = useSubagentsView();
  const pane = useOptionalChatPane();
  const key = call.use.data.id;
  const open = useChatPaneState((s) => s.openSubagents.has(key)) ?? false;
  const entry = view?.tree.byKey.get(key);
  const running = entry?.status === "running";
  // 実行中は「最後の動き」の表示を進める
  useTicker(running ? 15_000 : 3_600_000);
  if (!view || !entry) return <PlainCard call={call} />;

  const path = pathOf(view.tree, key);
  const depth = path.length - 1;
  const toggle = () => pane?.toggleSubagent(key);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    toggle();
  };
  return (
    <div id={`ev-${call.use.id}`} className={cx("subagent-card", running && "running", open && "open", depth >= FLAT_DEPTH && "flat")} data-depth={depth}>
      <div className="subagent-card-head" role="button" tabIndex={0} aria-expanded={open} onClick={toggle} onKeyDown={onKeyDown}>
        <ChevronRight size={14} className="tool-chevron" />
        <span className={cx("subagent-icon", running && "spinning")}>
          <ClaudeMark size={14} />
        </span>
        <span className="subagent-card-title">
          {depth >= FLAT_DEPTH && (
            <span className="subagent-card-path">
              {path
                .slice(0, -1)
                .map((s) => s.description)
                .join(" › ")}{" "}
              ›{" "}
            </span>
          )}
          <span className="subagent-card-name">{entry.description}</span>
          <span className="subagent-card-type">{entry.subagentType ?? "general-purpose"}</span>
          {showsSubagentStatus(entry) && (
            <span className={cx("subagent-status", subagentStatusClass(entry))} title={subagentStatusTitle(entry)}>
              {subagentStatusLabel(entry)}
            </span>
          )}
        </span>
        <SubagentTime entry={entry} />
      </div>
      <div className="subagent-card-now">
        {running ? <NowLine entry={entry} view={view} rel={rel} /> : <Summary entry={entry} childCount={childrenOf(view.tree, key).length} />}
        <span className="subagent-card-actions">
          <SubagentActions chatId={view.chatId} entry={entry} busy={view.busy} onOpen={(k) => pane?.revealSubagent(k)} />
          {pane && entry.agentId && (
            <button
              type="button"
              className="link-button subagent-tell"
              title="このサブエージェントに追加の指示を伝える（チャット欄の宛先をこのサブエージェントにし、メインのエージェントから SendMessage で渡します）"
              onClick={() => pane.tellSubagent(key)}
            >
              <Reply size={12} aria-hidden />
              伝える
            </button>
          )}
        </span>
      </div>
      {open && <SubagentCardBody entry={entry} view={view} renderItems={renderItems} />}
    </div>
  );
}

/** 呼び出しと結果が同じなら描き直さない（一覧・記録が変わったときは、読んでいる context で描き直る） */
export const SubagentCard = memo(SubagentCardView, (a, b) => a.call.use === b.call.use && a.call.result === b.call.result && a.rel === b.rel);

/** 一覧にないサブエージェント（チャットの画面の外など）: 名前だけ */
function PlainCard({ call }: { call: ToolCall }) {
  const input = call.use.data.input as { description?: string } | undefined;
  return (
    <div id={`ev-${call.use.id}`} className="subagent-card">
      <div className="subagent-card-head static">
        <span className="subagent-icon">
          <ClaudeMark size={14} />
        </span>
        <span className="subagent-card-title">
          <span className="subagent-card-name">{input?.description ?? "サブエージェント"}</span>
        </span>
      </div>
    </div>
  );
}

/** 開始〜終了の時刻（実行中は開始〜最後の動き）。今日なら時刻だけ、別の日なら日付も。乗せると年月日とかかった時間 */
function SubagentTime({ entry }: { entry: SubagentEntry }) {
  const start = entry.startedAt;
  if (!start) return null;
  const running = entry.status === "running";
  const end = running ? (entry.lastActivityAt ?? start) : (entry.endedAt ?? entry.lastActivityAt ?? start);
  const title = running
    ? `開始 ${formatFullStamp(start)}\n最後の動き ${formatFullStamp(end)}（実行中）`
    : `開始 ${formatFullStamp(start)}\n終了 ${formatFullStamp(end)}（${formatElapsed(Date.parse(end) - Date.parse(start))}）`;
  return (
    <span className={cx("tool-time", running && "running")} title={title}>
      {formatStampRange(start, end)}
    </span>
  );
}

/** 実行中のいまの動き（いちばん新しいツールの呼び出し。子孫のものは「洗い出し › 検索: …」）と、最後の動きからの時間・トークン数 */
function NowLine({ entry, view, rel }: { entry: SubagentEntry; view: SubagentsView; rel: (s: string) => string }) {
  const latest = useMemo(() => latestActivity(view.tree, entry.key, view.events), [view.tree, entry.key, view.events]);
  const what = latest
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
function Summary({ entry, childCount }: { entry: SubagentEntry; childCount: number }) {
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

/** 開いたカードの中身: 親からの依頼（初めはたたむ）→ 発言・ツール・入れ子のカード → 親への報告 → 実行中の印 */
function SubagentCardBody({ entry, view, renderItems }: { entry: SubagentEntry; view: SubagentsView; renderItems: RenderItems }) {
  const { key, agentId } = entry;
  const scope = scopeOf(entry);
  const scopeKey = scope.join(" ");
  const items = useMemo(() => {
    // チャット欄から伝えた追加の指示（メインのチャットの自分の発言）は、このサブエージェントの流れに自分の発言として混ぜる
    const mixed = agentId
      ? view.events.map((e) => {
          if (e.type !== "user") return e;
          const text = relayedText(e.data.text, agentId);
          return text === undefined ? e : ({ ...e, data: { ...e.data, text, parent: key } } as ChatEvent);
        })
      : view.events;
    return groupEvents(mixed, scopeKey.split(" "));
  }, [view.events, key, agentId, scopeKey]);
  const report = subagentReport(entry, view.events);
  const running = entry.status === "running";
  return (
    <div className="subagent-card-body">
      {entry.prompt && <SubagentPrompt text={entry.prompt} />}
      {items.length === 0 && <p className="muted small">{running ? "まだ動きがありません…" : "このサブエージェントの中身は記録されていません"}</p>}
      {renderItems(items, view.busy && running)}
      {report && (
        <div className="subagent-result">
          <div className="subagent-label">親のエージェントへの報告</div>
          <Markdown>{report}</Markdown>
        </div>
      )}
      {running && <Working>{workingText(entry)}</Working>}
    </div>
  );
}

/** 実行中のカードの中身の最後の行（子の結果を待っている・ツールを実行中・作業中） */
function workingText(entry: SubagentEntry): string {
  const tool = entry.pendingTool ?? entry.lastTool;
  if (tool && isSubagentTool(tool)) return "中で起動したサブエージェントの終わりを待っています";
  return tool ? `${tool} を実行中` : "作業中";
}

/** 親のエージェントからの依頼（初めは 1 行にたたみ、開くと全文） */
function SubagentPrompt({ text }: { text: string }) {
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

/** 裏で動かしたサブエージェントが終わった（その時刻の位置に 1 行）。押すとそのカードへ移って開く */
export function SubagentEndNote({ event, agentKey }: { event: ChatEventOf<"subagent">; agentKey: string }) {
  const view = useSubagentsView();
  const pane = useOptionalChatPane();
  const name = view?.tree.byKey.get(agentKey)?.description ?? (event.data.description || "サブエージェント");
  const verb = event.data.status === "completed" ? "終わりました" : event.data.status === "failed" ? "失敗しました" : "止まりました";
  return (
    <div className={cx("event-note subagent-end", event.data.status === "failed" && "error")}>
      <span className="subagent-icon">
        <ClaudeMark size={12} />
      </span>
      <span>
        裏で動かしたサブエージェント「{name}」が{verb}
      </span>
      <span className="event-time" title={formatFullStamp(event.created_at)}>
        {formatStamp(event.created_at)}
      </span>
      {pane && (
        <button type="button" className="link-button" onClick={() => pane.revealSubagent(agentKey)}>
          カードへ
        </button>
      )}
    </div>
  );
}
