import { ChevronRight, Eraser, FolderInput } from "lucide-react";
import { memo, type CSSProperties } from "react";
import type { ChatEvent, ChatEventOf } from "@shared/types";
import { workplaceMoveLine } from "@shared/chat/workplaceMoves";
import { formatElapsed, formatFullStamp, formatStamp } from "@/lib/time";
import { LazyDetails } from "@/ui/LazyDetails";
import type { TimelineItem, TurnHandoff } from "./timelineItems";
import { TurnEnd } from "./TurnEnd";
import type { FileChange } from "@/features/chat/tools/turnFileChanges";
import { ToolGroup } from "@/features/chat/tools/ToolGroup";
import { AssistantMessage } from "@/features/chat/messages/AssistantMessage";
import { UserMessage } from "@/features/chat/messages/UserMessage";
import { QuestionAnswerMessage } from "@/features/chat/messages/QuestionAnswerMessage";
import { SubagentCard } from "@/features/chat/subagents/SubagentCard";
import type { RenderItems } from "@/features/chat/subagents/subagentParts";
import { SubagentEndNote } from "@/features/chat/subagents/SubagentEndNote";
import { MemoVisualItem } from "@/features/chat/visuals/VisualItem";
import { CompactedRow } from "@/features/chat/status/CompactingRow";
import type { RowWindow } from "@/hooks/useRowWindow";
import { useTimelineOpen } from "./timelineView";
import { PastWorkplace } from "./PastWorkplace";

/**
 * タイムライン（発言とツールのまとまり）。rel はリポジトリの絶対パスを相対パスにする。
 * active（作業中で、いまの作業まで描いている）なら、いまの作業（最後の作業の終わりより後）の結果の届いていないツールを実行中として見せる
 * （前の作業で中断したまま結果のない呼び出しは、実行中にしない）
 */
export function TimelineItems({ items, rel, active }: { items: TimelineItem[]; rel: (s: string) => string; active: boolean }) {
  const floor = active ? activeFloor(items) : items.length;
  // 各項目は memo して、変わっていない発言・ツールは描き直さない（作業中は返答が届くたびに流れ全体が描き直されるため。
  // 長いチャットで Markdown を毎回解析し直すと、そのたびに 100ms ほどかかり、入力が重くなる）
  // サブエージェントのカードの中身も、同じ部品で描く（入れ子のカードもこの中で描かれる）
  const renderItems: RenderItems = (inner, innerActive) => <TimelineItems items={inner} rel={rel} active={innerActive} />;
  return items.map((item, i) => <TimelineRow key={item.key} item={item} live={i > floor} rel={rel} renderItems={renderItems} />);
}

/** いまの作業の始まり（最後の作業の終わりの位置。これより後ろがいまの作業の行） */
export const activeFloor = (items: TimelineItem[]) => items.findLastIndex((item) => item.kind === "event" && item.event.type === "result");

/**
 * 会話の流れ: 窓（useRowWindow）が決めた行だけを描き、窓の外は測った高さの箱にする（メモの仕様書「0023_表示を軽くする」の案 22）。
 * 行と箱は 1 つの並びにする（入れ子の配列にすると、箱が増えたときに後ろの行がすべて作り直される）。
 * activeFrom: いまの作業の始まり（流れ全体で求める。これより後ろの行に data-live）
 */
export function TimelineRows({ window: w, rel, activeFrom }: { window: RowWindow & { items: TimelineItem[] }; rel: (s: string) => string; activeFrom: number }) {
  const renderItems: RenderItems = (inner, innerActive) => <TimelineItems items={inner} rel={rel} active={innerActive} />;
  const { items } = w;
  return w.runs.flatMap((run) =>
    run.kind === "box"
      ? [<div key={`box-${items[run.start].key}`} className="timeline-box" style={{ height: run.height }} aria-hidden />]
      : items.slice(run.start, run.end).map((item, j) => (
          <TimelineRow
            key={item.key}
            item={item}
            live={run.start + j > activeFrom}
            rel={rel}
            renderItems={renderItems}
            rowRef={w.measureRef(item.key)}
            style={w.rowStyle(item.key)}
          />
        )),
  );
}

/**
 * 行の包み（.timeline-row）: 測る・content-visibility を当てる・窓から外す単位。作業中のいまの作業の行には data-live（画面の外でも描くのを省かない）、
 * 自分の発言・質問への回答の行には data-prompt-id（上に貼り付ける指示が、行の位置だけで探す）、data-row-key は窓が選択の端の行を見分ける
 */
function TimelineRow({
  item,
  live,
  rel,
  renderItems,
  rowRef,
  style,
}: {
  item: TimelineItem;
  live: boolean;
  rel: (s: string) => string;
  renderItems: RenderItems;
  rowRef?: (el: HTMLElement | null) => () => void;
  style?: CSSProperties;
}) {
  return (
    <div ref={rowRef} className="timeline-row" data-live={live ? "" : undefined} data-prompt-id={promptIdOf(item)} data-row-key={item.key} style={style}>
      <PastWorkplace eventId={eventIdOf(item)}>{renderItem(item, live, rel, renderItems)}</PastWorkplace>
    </div>
  );
}

/** 行の最初の記録の ID（作業場所を移した区切りより前の行かを見分ける） */
function eventIdOf(item: TimelineItem): number | undefined {
  switch (item.kind) {
    case "tools":
      return item.tools[0]?.use.id;
    case "subagent":
    case "visual":
      return item.call.use.id;
    default:
      return item.event.id;
  }
}

/** 自分の発言・質問への回答の行なら、その記録の ID（上に貼り付ける指示の候補。ほかの行は undefined） */
function promptIdOf(item: TimelineItem): number | undefined {
  if (item.kind !== "event") return undefined;
  const e = item.event;
  return e.type === "user" || (e.type === "approval_resolved" && e.data.action === "answer") ? e.id : undefined;
}

/** 項目 1 つ（live: いまの作業の中の項目。結果の届いていないツールを実行中として見せる） */
function renderItem(item: TimelineItem, live: boolean, rel: (s: string) => string, renderItems: RenderItems) {
  switch (item.kind) {
    case "tools":
      return <MemoToolGroup tools={item.tools} rel={rel} active={live} />;
    case "subagent":
      return <SubagentCard call={item.call} rel={rel} renderItems={renderItems} />;
    case "subagentEnd":
      return <SubagentEndNote event={item.event} agentKey={item.agentKey} />;
    case "visual":
      return <MemoVisualItem call={item.call} />;
    default:
      return (
        <MemoEventItem
          event={item.event}
          turnStart={item.turnStart}
          turnText={item.turnText}
          turnChanges={item.turnChanges}
          turnHandoff={item.turnHandoff}
          turnHandoffs={item.turnHandoffs}
          createdChats={item.createdChats}
        />
      );
  }
}

/** ツールのまとまり: 呼び出しと結果の記録が同じなら描き直さない（まとまりの配列は記録が増えるたびに作り直されるため、中身で比べる） */
const MemoToolGroup = memo(
  ToolGroup,
  (a, b) =>
    a.rel === b.rel &&
    a.active === b.active &&
    a.tools.length === b.tools.length &&
    a.tools.every((t, i) => t.use === b.tools[i].use && t.result === b.tools[i].result),
);

/**
 * 思考の行（「8秒間思考しました」。中身があれば開いて読める）。後ろに考え始めた時刻
 * （記録は考え終えたときに残るので、かかった時間を引く。乗せると年月日と考え終えた時刻）
 */
function Thinking({ event }: { event: ChatEventOf<"thinking"> }) {
  const { text, duration_ms: durationMs } = event.data;
  const at = event.created_at;
  // 開閉は流れの見え方の店（画面を作り直しても開いたまま）
  const [open, setOpen] = useTimelineOpen(event.chat_id, `th:${event.id}`);
  const label =
    durationMs === undefined ? "思考しました" : `${formatElapsed(durationMs)}${durationMs < 3_600_000 ? "間" : ""}思考しました`;
  const start = new Date(Date.parse(at) - (durationMs ?? 0)).toISOString();
  const time = (
    <span className="event-time" title={`開始 ${formatFullStamp(start)}\n終了 ${formatFullStamp(at)}`}>
      {formatStamp(start)}
    </span>
  );
  if (!text.trim())
    return (
      <div className="event-note thinking">
        {label}
        {time}
      </div>
    );
  // 思考の全文は、初めて開いたときに作る
  return (
    <LazyDetails
      className="event-note thinking"
      open={open}
      onOpenChange={setOpen}
      summary={
        <summary>
          <ChevronRight size={13} className="tool-chevron" />
          {label}
          {time}
        </summary>
      }
    >
      {() => <div className="thinking-body">{text}</div>}
    </LazyDetails>
  );
}

const RESOLVED_LABELS: Record<string, string> = {
  allow: "許可しました",
  allow_always: "常に許可しました",
  deny: "拒否しました",
  answer: "質問に回答しました",
};

/** 発言・お知らせ 1 件（作業の終わりには、作業時間と返答のコピーを出す） */
const MemoEventItem = memo(EventItem);

function EventItem({
  event,
  turnStart,
  turnText,
  turnChanges,
  turnHandoff,
  turnHandoffs,
  createdChats,
}: {
  event: ChatEvent;
  turnStart?: string;
  turnText?: string;
  turnChanges?: FileChange[];
  turnHandoff?: TurnHandoff;
  turnHandoffs?: ChatEventOf<"handoff">[];
  createdChats?: string;
}) {
  switch (event.type) {
    case "user":
      return <UserMessage event={event} createdChats={createdChats} />;
    case "text":
      return <AssistantMessage event={event} />;
    case "thinking":
      return <Thinking event={event} />;
    case "approval_resolved": {
      // AI からの質問に答えた内容は、自分の発言と同じ吹き出しで「質問への回答」として出す
      const data = event.data;
      if (data.action === "answer") return <QuestionAnswerMessage event={event} data={data} />;
      if (data.kind === "question" && data.action === "deny") return <div className="event-note">質問をスキップしました</div>;
      return <div className="event-note">{RESOLVED_LABELS[data.action] ?? "回答済み"}</div>;
    }
    case "result":
      return <TurnEnd event={event} turnStart={turnStart} turnText={turnText} turnChanges={turnChanges} turnHandoff={turnHandoff} turnHandoffs={turnHandoffs} />;
    case "error":
      return (
        <div className="event-note error" id={`ev-${event.id}`}>
          {event.data.message}
        </div>
      );
    case "notice":
      return (
        <div className="event-note" id={`ev-${event.id}`}>
          {event.data.message}
        </div>
      );
    case "compact":
      // 手で圧縮したとき・上限に近づいて自動で圧縮されたとき（圧縮中の行と同じ枠のまま残す）
      return <CompactedRow event={event} />;
    case "context_cleared":
      // 送信待ちの「コンテキストを消去」で、ここから新しい会話にした境目（上の会話は AI に引き継いでいない）
      return (
        <div className="context-cleared-divider" id={`ev-${event.id}`} role="separator" aria-label="コンテキストを消去しました">
          <Eraser size={12} aria-hidden />
          <span>コンテキストを消去しました（ここから新しい会話）</span>
        </div>
      );
    case "workplace_moved":
      // 作業場所を移した区切り（メモの仕様書「0025」）。これより上の発言は巻き戻せず、分岐の起点にもできない
      return (
        <div className="workplace-moved-divider" id={`ev-${event.id}`} role="separator" aria-label="作業場所を移しました">
          <FolderInput size={12} aria-hidden />
          <span>{workplaceMoveLine(event.data)}</span>
        </div>
      );
    default:
      return null;
  }
}
