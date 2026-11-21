// サブエージェントの数え方（@shared/chat/subagents の collectSubagents・報告の受け渡し）に要る記録だけを、要る欄だけ読む。
// 数え方が見ない種類（お知らせ・承認など）は読まず、文・思考の本文、ツールの引数（起動と報告のツールのほか）、ツールの結果の本文（起動の結果のほか）、
// 最後まで終わった作業の終わりの文は外す。数え方の答えは全部を読んだときと同じ（subagentEvents.test.ts）
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { SUBAGENT_TOOLS } from "@shared/chat/subagents";
import type { ChatEvent, ChatEventData } from "@shared/chat/chatEvent";

/** 数え方が見る種類 */
const TYPES = ["user", "text", "thinking", "tool_use", "tool_result", "subagent", "result"] as const;

/** 引数ごと読むツール（サブエージェントの起動と、サブエージェントが親へ報告を渡すツール） */
const FULL_TOOLS = [...SUBAGENT_TOOLS, "SubagentHandback"];

const DATA = `CASE type
  WHEN 'user' THEN json_remove(data, '$.text', '$.attachments')
  WHEN 'text' THEN json_remove(data, '$.text')
  WHEN 'thinking' THEN json_remove(data, '$.text')
  WHEN 'tool_use' THEN CASE WHEN json_extract(data, '$.name') IN (${FULL_TOOLS.map(() => "?").join(", ")}) THEN data ELSE json_remove(data, '$.input') END
  WHEN 'tool_result' THEN json_remove(data, '$.content')
  WHEN 'result' THEN CASE WHEN json_extract(data, '$.status') = 'failed' THEN data ELSE json_remove(data, '$.text') END
  ELSE data END`;

type Row = { id: number; chat_id: number; type: ChatEvent["type"]; data: string; created_at: string };

/** そのチャットの、サブエージェントの数え方に要る記録（古い順） */
export function readSubagentEvents(db: DatabaseSync, chatId: number): ChatEvent[] {
  const params: SQLInputValue[] = [...FULL_TOOLS, chatId, ...TYPES];
  const rows = db.prepare(`SELECT id, chat_id, type, ${DATA} AS data, created_at FROM chat_events WHERE chat_id = ? AND type IN (${TYPES.map(() => "?").join(", ")}) ORDER BY id`).all(...params) as unknown as Row[];
  const events = rows.map((row) => ({ ...row, data: JSON.parse(row.data) as ChatEventData }) as ChatEvent);
  // 起動の結果だけは本文を読む（裏で動かした・通信の切断・出力の上限を、本文で見分けるため）
  const launches = new Set(events.flatMap((e) => (e.type === "tool_use" && SUBAGENT_TOOLS.includes(e.data.name) ? [e.data.id] : [])));
  const wanted = events.filter((e) => e.type === "tool_result" && launches.has(e.data.tool_use_id));
  const byId = new Map(events.map((e) => [e.id, e]));
  for (let i = 0; i < wanted.length; i += 500) {
    const ids = wanted.slice(i, i + 500).map((e) => e.id);
    const full = db.prepare(`SELECT id, data FROM chat_events WHERE id IN (${ids.map(() => "?").join(", ")})`).all(...ids) as unknown as { id: number; data: string }[];
    for (const f of full) Object.assign(byId.get(f.id)!, { data: JSON.parse(f.data) as ChatEventData });
  }
  return events;
}
