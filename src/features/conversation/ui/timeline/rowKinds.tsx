// 流れの種類の表（項目の種類ごとの見分け方・高さの見積もり・描き方）。流れの行の部品を import するのはこのファイルだけ
import { memo, type ReactNode } from "react";
import type { ChatEvent, ChatEventOf } from "@shared/chat/chatEvent";
import { hasDenyReason } from "@shared/chat/denyReason";
import type { RenderScope, ToolCall } from "@/features/chat/ui";
import { ProviderSwitchRecord } from "@/features/providerSwitch/ui";
import { ToolGroup } from "@/features/conversation/ui/tools/ToolGroup";
import { AssistantMessage } from "@/features/conversation/ui/messages/AssistantMessage";
import { SubagentCard, SubagentEndNote } from "@/features/subagents/ui";
import { MemoVisualItem } from "@/features/visuals/ui";
import { CompactedRow } from "@/features/compact/ui";
import type { TimelineItem } from "@/features/conversation/ui/timelineItems";
import { ROW_ESTIMATES, type EstimateContext, type EstimateKind } from "./rowEstimate";
import { TurnEnd } from "./TurnEnd";
import { Thinking } from "./rows/Thinking";
import { ContextClearedDivider, WorkplaceMovedDivider } from "./rows/dividers";
import { EventNote, ResolvedRow } from "./rows/notes";
import { UserRow } from "./rows/UserRow";

/** 行を描く文脈。live: いまの作業の中の行（結果の届いていないツールを実行中に見せる）・main: メインの流れ（サブエージェントのカードの中でない） */
export interface RowContext {
  live: boolean;
  main: boolean;
  rel: (s: string) => string;
  renderScope: RenderScope;
}

export interface RowKind<I extends TimelineItem> {
  /** 行の最初の記録の ID（作業場所を移した区切りより前の行かの見分け） */
  firstEventId(item: I): number | undefined;
  /** 記録の ID を含むか（発言そのもの・ツールの呼び出しと結果。移る処理が流れの窓の行の番号にする） */
  contains(item: I, eventId: number): boolean;
  /** 自分の発言・質問への回答の行なら、その記録の ID（上に貼り付ける指示の候補。data-prompt-id） */
  promptId?(item: I): number | undefined;
  /** 見積もりの種類（補正を種類ごとに覚える） */
  estimateKind(item: I): EstimateKind;
  /** 倍率 1 のときの高さの見積もり（補正の前） */
  estimate(item: I, ctx: EstimateContext): number;
  render(item: I, ctx: RowContext): ReactNode;
}

/** 記録 1 件の行（項目の種類 event）の、記録の種類ごとの扱い。書いていない種類は出さない（init・approval・handoff は項目にならず、tool_result・subagent はほかの項目に入る） */
interface EventRow<E extends ChatEvent> {
  /** 自分の発言・質問への回答か（上に貼り付ける指示の候補） */
  prompt?(event: E): boolean;
  /** 見積もりの種類（省けば note） */
  estimateKind?(event: E): EstimateKind;
  /** 倍率 1 のときの高さの見積もり（省けば note の 1 行） */
  estimate?(event: E, ctx: EstimateContext): number;
  /** main: メインの流れか（記録の行は memo するので、描くたびに変わる文脈は渡さない） */
  render(event: E, main: boolean): ReactNode;
}

const isAnswer = (e: ChatEventOf<"approval_resolved">) => e.data.action === "answer";

export const EVENT_ROWS: { [T in ChatEvent["type"]]?: EventRow<ChatEventOf<T>> } = {
  user: { prompt: () => true, estimateKind: () => "user", estimate: ROW_ESTIMATES.user, render: (e, main) => <UserRow event={e} main={main} /> },
  text: { estimateKind: () => "text", estimate: ROW_ESTIMATES.text, render: (e) => <AssistantMessage event={e} /> },
  thinking: { estimateKind: () => "thinking", estimate: ROW_ESTIMATES.thinking, render: (e) => <Thinking event={e} /> },
  approval_resolved: {
    prompt: isAnswer,
    // 質問への回答・拒否の理由は自分の吹き出し、それ以外（許可・理由なしの拒否）は 1 行
    estimateKind: (e) => (isAnswer(e) || hasDenyReason(e.data) ? "user" : "note"),
    estimate: (e) => (isAnswer(e) || hasDenyReason(e.data) ? ROW_ESTIMATES.answer() : ROW_ESTIMATES.note()),
    render: (e) => <ResolvedRow event={e} />,
  },
  // 作業の終わりには、作業時間と返答のコピーを出す
  result: { estimateKind: () => "turn", estimate: ROW_ESTIMATES.turn, render: (e) => <TurnEnd event={e} /> },
  error: { render: (e) => <EventNote event={e} /> },
  notice: { render: (e) => <EventNote event={e} /> },
  // 手で圧縮したとき・上限に近づいて自動で圧縮されたとき（圧縮中の行と同じ枠のまま残す）
  compact: { estimateKind: () => "compact", estimate: ROW_ESTIMATES.compact, render: (e) => <CompactedRow event={e} /> },
  context_cleared: { render: (e) => <ContextClearedDivider event={e} /> },
  provider_switched: { render: (e) => <ProviderSwitchRecord event={e} /> },
  workplace_moved: { render: (e) => <WorkplaceMovedDivider event={e} /> },
};

const eventRowOf = <E extends ChatEvent>(event: E) => EVENT_ROWS[event.type] as EventRow<E> | undefined;

/** 記録 1 件の行（memo して、変わっていない発言は描き直さない。長いチャットで Markdown を毎回解析し直すと、入力が重くなる） */
const MemoEventRow = memo(function EventRowView({ event, main }: { event: ChatEvent; main: boolean }) {
  return eventRowOf(event)?.render(event, main) ?? null;
});

/** ツールのまとまり（項目は中身が同じなら前の物なので、ふつうの memo で描き直さない） */
const MemoToolGroup = memo(ToolGroup);

const callsContain = (calls: readonly ToolCall[], eventId: number) => calls.some((t) => t.use.id === eventId || t.result?.id === eventId);

export const ROW_KINDS: { [K in TimelineItem["kind"]]: RowKind<Extract<TimelineItem, { kind: K }>> } = {
  event: {
    firstEventId: (item) => item.event.id,
    contains: (item, eventId) => item.event.id === eventId,
    promptId: (item) => (eventRowOf(item.event)?.prompt?.(item.event) ? item.event.id : undefined),
    estimateKind: (item) => eventRowOf(item.event)?.estimateKind?.(item.event) ?? "note",
    estimate: (item, ctx) => eventRowOf(item.event)?.estimate?.(item.event, ctx) ?? ROW_ESTIMATES.note(),
    render: (item, ctx) => <MemoEventRow event={item.event} main={ctx.main} />,
  },
  tools: {
    firstEventId: (item) => item.tools[0]?.use.id,
    contains: (item, eventId) => callsContain(item.tools, eventId),
    estimateKind: () => "tools",
    estimate: (item, ctx) => ROW_ESTIMATES.tools(item.tools, ctx),
    render: (item, ctx) => <MemoToolGroup tools={item.tools} rel={ctx.rel} active={ctx.live} />,
  },
  subagent: {
    firstEventId: (item) => item.call.use.id,
    contains: (item, eventId) => callsContain([item.call], eventId),
    estimateKind: () => "subagent",
    estimate: (item, ctx) => ROW_ESTIMATES.subagent(item.call, ctx),
    render: (item, ctx) => <SubagentCard call={item.call} rel={ctx.rel} renderScope={ctx.renderScope} />,
  },
  visual: {
    firstEventId: (item) => item.call.use.id,
    contains: (item, eventId) => callsContain([item.call], eventId),
    estimateKind: () => "visual",
    estimate: ROW_ESTIMATES.visual,
    render: (item) => <MemoVisualItem call={item.call} />,
  },
  subagentEnd: {
    firstEventId: (item) => item.event.id,
    contains: (item, eventId) => item.event.id === eventId,
    estimateKind: () => "note",
    estimate: ROW_ESTIMATES.subagentEnd,
    render: (item) => <SubagentEndNote event={item.event} agentKey={item.agentKey} />,
  },
};

/** 項目の種類の扱い */
export const rowKindOf = <I extends TimelineItem>(item: I) => ROW_KINDS[item.kind] as unknown as RowKind<I>;

/** 補正の前の見積もり（倍率を掛けたもの。補正を進めるときに測った高さと比べる） */
export function estimateRaw(item: TimelineItem, ctx: EstimateContext): number {
  return rowKindOf(item).estimate(item, ctx) * ctx.scale;
}

/** 測っていない行の高さ（px。種類ごとの補正を掛ける） */
export function estimateItem(item: TimelineItem, ctx: EstimateContext): number {
  return Math.max(1, Math.round(estimateRaw(item, ctx) * ctx.correction(rowKindOf(item).estimateKind(item))));
}
