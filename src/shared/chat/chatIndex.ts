import type { ChatEvent, ChatEventType } from "@shared/types";
import { AI_SHOW_VISUAL_TOOL, AI_UPDATE_VISUAL_TOOL } from "@shared/visuals/aiVisual";

/*
 * 記録の索引。画面は最新の数十ターン分（末尾 tail）だけを中身のまま持ち、
 * それより前は「記録全体から作るもの（指示の履歴・ToDo・サブエージェントの一覧・図など）が読む記録」だけを軽くして持つ（索引 index）。
 * 記録全体から作るものは、いまの関数をそのまま「索引 ＋ 末尾」に流し、全件に流したときと同じ結果になる（どの切れ目でも。テストで確かめる）。
 *
 * 選ぶ決まりを書くのはここの selectIndexIds の 1 か所だけ（コアは覆う索引から読んだ ChatEventMeta を渡し、画面は縮めるときに持っている記録から
 * metaOfEvent で作って渡す。SQL に同じ決まりを書き直さない）。記録全体から作るものが新しく読む種類・項目を増やしたら、ここの規則と
 * ChatEventMeta の項目（とコアの覆う索引の列）と同値のテストを同じコミットで直す。
 *
 * R1 種類が INDEX_TYPES のもの（ターン・サブエージェントの数に比例）→ すべて（result の text は失敗のときだけ）
 * R2 名前が INDEX_TOOLS の tool_use と、その tool_result → すべて
 * R3 ほかの記録・コアの状態が ID で指す tool_use（subagent の tool_use_id・task_id、回答待ち・裏の作業の呼び出し）→ 軽く（input は {}）
 * R4 parent ごとに、中の最後の text / thinking / tool_use / tool_result（軽く）と、最後の tool_use（input を残す。カードの「いま」）
 * R5 報告（subagent の completed・SubagentHandback）のあと、次の result までの親（parent なし）の最初の text / thinking / tool_use → 軽く
 */

/** 索引の規則が見る、記録ごとの軽い形（コアは覆う索引だけから読む。data の JSON を解かない） */
export interface ChatEventMeta {
  id: number;
  type: ChatEventType;
  /** tool_use の呼び出し ID（data.id） */
  callId: string | null;
  /** tool_use の名前 */
  name: string | null;
  parent: string | null;
  /** tool_result・subagent の tool_use_id */
  toolUseId: string | null;
  /** subagent の作業 ID */
  taskId: string | null;
  /** subagent の状態（result の終わり方も入るが、規則は subagent のものだけを見る） */
  status: string | null;
}

/** 索引の残し方: full = 中身のまま（result の text は失敗のときだけ）/ slim = 重い中身（文・input・content）を空にする */
export type IndexKeep = "full" | "slim";

/** 索引を選ぶときに、記録の外から渡す ID（いまの回答待ちの依頼・裏の作業を起動した呼び出し） */
export interface IndexContext {
  approvalCallIds: readonly string[];
  backgroundCallIds: readonly string[];
}

/** R1: 丸ごと入れる種類 */
const INDEX_TYPES: ReadonlySet<ChatEventType> = new Set<ChatEventType>([
  "user",
  "init",
  "result",
  "error",
  "compact",
  "context_cleared",
  "provider_switched",
  "workplace_moved",
  "subagent",
  "approval_resolved",
  "handoff",
]);

/** R2: 呼び出しと結果を丸ごと入れるツール（サブエージェントの起動・報告・ToDo・図） */
const INDEX_TOOLS: ReadonlySet<string> = new Set([
  "Agent",
  "SendMessage",
  "SubagentHandback",
  "TodoWrite",
  "TaskCreate",
  "TaskUpdate",
  AI_SHOW_VISUAL_TOOL,
  AI_UPDATE_VISUAL_TOOL,
]);

const ACTIVITY_TYPES: ReadonlySet<ChatEventType> = new Set<ChatEventType>(["text", "thinking", "tool_use", "tool_result"]);
const PARENT_MOVE_TYPES: ReadonlySet<ChatEventType> = new Set<ChatEventType>(["text", "thinking", "tool_use"]);

/** 持っている記録から、索引の規則が見る軽い形を作る（画面が末尾を縮めるとき。コアは覆う索引から同じ形を読む） */
export function metaOfEvent(e: ChatEvent): ChatEventMeta {
  const d = e.data as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    id: e.id,
    type: e.type,
    callId: e.type === "tool_use" ? str(d.id) : null,
    name: e.type === "tool_use" ? str(d.name) : null,
    parent: str(d.parent),
    toolUseId: str(d.tool_use_id),
    taskId: str(d.task_id),
    status: str(d.status),
  };
}

/**
 * 索引に入れる記録（id < start のもの）と残し方を選ぶ。metas は古い順。同じ記録が複数の規則に当たれば、中身を多く残す方（full）
 */
export function selectIndexIds(metas: readonly ChatEventMeta[], start: number, ctx: IndexContext): Map<number, IndexKeep> {
  const picked = new Map<number, IndexKeep>();
  const pick = (id: number, keep: IndexKeep) => {
    if (picked.get(id) !== "full") picked.set(id, keep);
  };
  // R3 の指される呼び出し ID（subagent は呼び出しのあとに届くので、先に集める）
  const refs = new Set<string>([...ctx.approvalCallIds, ...ctx.backgroundCallIds]);
  for (const m of metas) {
    if (m.id >= start) break;
    if (m.type !== "subagent") continue;
    if (m.toolUseId) refs.add(m.toolUseId);
    if (m.taskId) refs.add(m.taskId);
  }
  const indexCalls = new Set<string>();
  // R4: parent ごとの最後の動きと最後の呼び出し
  const lastMove = new Map<string, number>();
  const lastCall = new Map<string, number>();
  // R5: 報告のあと、親がまだ動いていない
  let reportPending = false;
  for (const m of metas) {
    if (m.id >= start) break;
    if (INDEX_TYPES.has(m.type)) pick(m.id, "full");
    if (m.type === "tool_use" && m.callId !== null) {
      if (m.name !== null && INDEX_TOOLS.has(m.name)) {
        indexCalls.add(m.callId);
        pick(m.id, "full");
      }
      if (refs.has(m.callId)) pick(m.id, "slim");
    }
    if (m.type === "tool_result" && m.toolUseId !== null && indexCalls.has(m.toolUseId)) pick(m.id, "full");
    if (m.parent !== null && ACTIVITY_TYPES.has(m.type)) {
      lastMove.set(m.parent, m.id);
      if (m.type === "tool_use") lastCall.set(m.parent, m.id);
    }
    if ((m.type === "subagent" && m.status === "completed") || (m.type === "tool_use" && m.name === "SubagentHandback" && m.parent !== null)) {
      reportPending = true;
    } else if (m.type === "result") {
      reportPending = false;
    } else if (reportPending && m.parent === null && PARENT_MOVE_TYPES.has(m.type)) {
      pick(m.id, "slim");
      reportPending = false;
    }
  }
  for (const id of lastMove.values()) pick(id, "slim");
  for (const id of lastCall.values()) pick(id, "full");
  return picked;
}

/** 索引に入れる記録を軽くする（slim: 文・input・content を空に。full でも、成功した作業の終わりの返答の写しは誰も読まないので外す） */
export function slimIndexEvent(e: ChatEvent, keep: IndexKeep): ChatEvent {
  if (e.type === "result") {
    if (e.data.status === "failed" || e.data.text === undefined) return e;
    const { text: _text, ...rest } = e.data;
    return { ...e, data: rest };
  }
  if (keep === "full") return e;
  switch (e.type) {
    case "text":
    case "thinking":
      return e.data.text === "" ? e : { ...e, data: { ...e.data, text: "" } };
    case "tool_use":
      return { ...e, data: { ...e.data, input: {} } };
    case "tool_result":
      return e.data.content === "" ? e : { ...e, data: { ...e.data, content: "" } };
    default:
      return e;
  }
}

/** 持っている記録（古い順）から、id < start の分を索引にする（画面が末尾を縮めるとき） */
export function indexOfEvents(events: readonly ChatEvent[], start: number, ctx: IndexContext): ChatEvent[] {
  const picked = selectIndexIds(events.map(metaOfEvent), start, ctx);
  const index: ChatEvent[] = [];
  for (const e of events) {
    if (e.id >= start) break;
    const keep = picked.get(e.id);
    if (keep) index.push(slimIndexEvent(e, keep));
  }
  return index;
}

/** ID の順に並んだ記録の並びをいくつか、ID の順に 1 本にする（同じ ID は先の並びのものを使う） */
export function mergeById(...lists: readonly (readonly ChatEvent[])[]): ChatEvent[] {
  const nonEmpty = lists.filter((l) => l.length > 0);
  if (nonEmpty.length === 0) return [];
  if (nonEmpty.length === 1) return [...nonEmpty[0]];
  const byId = new Map<number, ChatEvent>();
  for (const list of nonEmpty) for (const e of list) if (!byId.has(e.id)) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}
