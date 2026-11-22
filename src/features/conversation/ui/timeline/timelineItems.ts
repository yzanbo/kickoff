// チャットのタイムラインの組み立て（イベント → 表示の単位）。作業の終わりに付けるものと AI が作ったチャットは turnExtras.ts
import type { ChatEvent, ChatEventOf } from "@shared/chat/chatEvent";
import { isBackgroundLaunch } from "@shared/chat/backgroundTasks";
import { isSubagentTool } from "@shared/ai/claudeTools";
import { AI_SHOW_VISUAL_TOOL, AI_UPDATE_VISUAL_TOOL } from "@shared/visuals/aiVisual";
import type { ToolCall } from "@/features/chat/ui";

/** 流れの項目（種類ごとの見せ方・見積もり・見分け方は rowKinds.tsx の表） */
export type TimelineItem =
  | { kind: "event"; key: string; event: ChatEvent }
  | { kind: "tools"; key: string; tools: ToolCall[] }
  /** サブエージェントの起動（Agent / Task の呼び出し。ツールのまとまりに入れず、流れの中のカードにする） */
  | { kind: "subagent"; key: string; call: ToolCall }
  /** AI が返答の中に描いた図・描き直し（show_visual / update_visual。ツールのまとまりに入れず、文の間に図として出す） */
  | { kind: "visual"; key: string; call: ToolCall }
  /** 裏で動かしたサブエージェントが終わった（その時刻の位置に 1 行。agentKey は一覧の行のキー = 起動した呼び出し ID） */
  | { kind: "subagentEnd"; key: string; event: ChatEventOf<"subagent">; agentKey: string };

/** サブエージェントの中の記録なら、そのサブエージェントを起動した呼び出し ID（メインの記録・parent のない種類は undefined） */
export const parentOf = (e: ChatEvent): string | undefined => ("parent" in e.data ? e.data.parent : undefined);

/** これより短い思考（中身なし）はタイムラインに出さない */
const THINKING_MIN_MS = 2000;

/** 流れの項目の組み立て方（末尾・途中の一部分だけを描くとき・組み立て直すとき） */
export interface GroupOptions {
  /** 描く記録より前の、記録全体から作るものに要る記録（索引など）。項目は作らず、前に起動・裏で動かしたサブエージェントを数える */
  preface?: readonly ChatEvent[];
  /** 前の回の項目。中身が同じ項目には前の物を返す（memo した行を描き直させない） */
  prev?: readonly TimelineItem[];
}

/**
 * 連続するツールの実行を 1 つのまとまりにする（結果は対応する呼び出しにぶら下げる）。サブエージェントの起動は、まとまりに入れずカードの項目にする。
 * scope を渡すとそのサブエージェントの中身だけ（行のキーと、再開した回の呼び出し ID。SubagentEntry の key と aliases）、
 * 渡さなければメインエージェントの分だけを並べる
 */
export function groupEvents(events: readonly ChatEvent[], scope?: readonly string[], opts: GroupOptions = {}): TimelineItem[] {
  const items: TimelineItem[] = [];
  const byId = new Map<string, ToolCall>();
  const inScope = (parent: string | undefined) => (scope === undefined ? parent === undefined : parent !== undefined && scope.includes(parent));
  // サブエージェントの起動: どの流れで起動したか（その流れに終わりの 1 行を出す）・裏で動かしたか・作業 ID → 起動した呼び出し ID
  const launchedHere = new Set<string>();
  const backgrounded = new Set<string>();
  const agentOfTask = new Map<string, string>();
  // 描く記録より前に起動したサブエージェント（終わりの 1 行を出すかに使う。項目は作らない）
  for (const e of opts.preface ?? []) {
    if (e.type === "subagent") {
      const agentKey = agentOfTask.get(e.data.task_id) ?? e.data.tool_use_id;
      if (agentKey === undefined) continue;
      if (e.data.tool_use_id === agentKey) agentOfTask.set(e.data.task_id, agentKey);
      else if (e.data.tool_use_id !== undefined) backgrounded.add(agentKey);
    } else if (e.type === "tool_result" && isBackgroundLaunch(e.data.content)) backgrounded.add(e.data.tool_use_id);
    else if (e.type === "tool_use" && inScope(parentOf(e)) && isSubagentTool(e.data.name)) launchedHere.add(e.data.id);
  }
  for (const e of events) {
    // サブエージェントの知らせ（parent を持たない）: 裏で動かしたものが終わったら、起動した流れに 1 行
    if (e.type === "subagent") {
      const d = e.data;
      const agentKey = agentOfTask.get(d.task_id) ?? d.tool_use_id;
      if (agentKey === undefined) continue;
      if (d.tool_use_id === agentKey) agentOfTask.set(d.task_id, agentKey);
      // 再開した回（呼び出し ID が SendMessage のもの）は、いつも裏で動く
      else if (d.tool_use_id !== undefined) backgrounded.add(agentKey);
      if (d.status !== "running" && backgrounded.has(agentKey) && launchedHere.has(agentKey)) items.push({ kind: "subagentEnd", key: `x${e.id}`, event: e, agentKey });
      continue;
    }
    // 裏で動かしたサブエージェント（結果が「起動した」という知らせ）。どの流れの記録でも数える
    if (e.type === "tool_result" && isBackgroundLaunch(e.data.content)) backgrounded.add(e.data.tool_use_id);
    if (!inScope(parentOf(e))) continue;
    if (e.type === "tool_use") {
      const call: ToolCall = { use: e };
      byId.set(e.data.id, call);
      if (isSubagentTool(e.data.name)) {
        launchedHere.add(e.data.id);
        items.push({ kind: "subagent", key: `s${e.id}`, call });
        continue;
      }
      if (e.data.name === AI_SHOW_VISUAL_TOOL || e.data.name === AI_UPDATE_VISUAL_TOOL) {
        items.push({ kind: "visual", key: `v${e.id}`, call });
        continue;
      }
      const last = items[items.length - 1];
      if (last?.kind === "tools") last.tools.push(call);
      else items.push({ kind: "tools", key: `t${e.id}`, tools: [call] });
    } else if (e.type === "tool_result") {
      const call = byId.get(e.data.tool_use_id);
      if (call) call.result = e;
    } else if (e.type === "thinking") {
      // 中身があるか、しばらく考えたものだけ出す（短い思考でツールのまとまりを細切れにしない）
      const { text, duration_ms } = e.data;
      if (text.trim() || (duration_ms ?? 0) >= THINKING_MIN_MS) items.push({ kind: "event", key: `e${e.id}`, event: e });
    } else if (e.type !== "init" && e.type !== "approval" && e.type !== "handoff") {
      // init・承認の頼み・親へ渡した記録は出さない
      items.push({ kind: "event", key: `e${e.id}`, event: e });
    }
  }
  return opts.prev ? reuseSame(items, opts.prev) : items;
}

/** 呼び出しと結果の記録が同じか */
const sameCalls = (a: readonly ToolCall[], b: readonly ToolCall[]) => a.length === b.length && a.every((t, i) => t.use === b[i].use && t.result === b[i].result);
const callsOf = (item: TimelineItem): readonly ToolCall[] => ("tools" in item ? item.tools : "call" in item ? [item.call] : []);
const eventOf = (item: TimelineItem): ChatEvent | undefined => ("event" in item ? item.event : undefined);
const agentOf = (item: TimelineItem): string | undefined => ("agentKey" in item ? item.agentKey : undefined);

/** 中身が同じ項目（同じキー・同じ記録）は前の物にする */
function reuseSame(items: TimelineItem[], prev: readonly TimelineItem[]): TimelineItem[] {
  if (prev.length === 0) return items;
  const byKey = new Map(prev.map((item) => [item.key, item]));
  return items.map((item) => {
    const old = byKey.get(item.key);
    return old && old.kind === item.kind && eventOf(old) === eventOf(item) && agentOf(old) === agentOf(item) && sameCalls(callsOf(old), callsOf(item)) ? old : item;
  });
}
