// Claude Code のサブエージェントの会話（getSubagentMessages のメッセージ）を、プロバイダーによらない形にそろえる
import type { SubagentLogItem } from "../types.js";

/** getSubagentMessages が返すメッセージのうち、ここで読むところ */
export interface SubagentMessageLike {
  type: string;
  message: unknown;
}

type Block = { type?: string; text?: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: unknown; is_error?: boolean };

/** Claude Code が足す注意書き（<system-reminder> など）を除いた文 */
const withoutReminders = (text: string) => text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();

/** ツールの結果の中身を文にする（画像などは印だけ） */
function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return (content as Block[]).map((b) => (b.type === "text" ? (b.text ?? "") : `[${b.type ?? "?"}]`)).join("\n");
}

/** メッセージの中身をブロックの並びにする（文だけのものは text のブロック 1 つ） */
function blocksOf(message: unknown): Block[] {
  const content = (message as { content?: unknown } | null)?.content;
  if (typeof content === "string") return [{ type: "text", text: content }];
  return Array.isArray(content) ? (content as Block[]) : [];
}

/**
 * サブエージェントのメッセージを古い順に、依頼・発言・ツール（呼び出しと結果を組にする）に並べる。
 * 考えている途中と、Claude Code が足す注意書きだけの発言は入れない
 */
export function subagentLogOf(messages: readonly SubagentMessageLike[]): SubagentLogItem[] {
  const items: SubagentLogItem[] = [];
  const tools = new Map<string, Extract<SubagentLogItem, { kind: "tool" }>>();
  for (const m of messages) {
    if (m.type !== "user" && m.type !== "assistant") continue;
    for (const b of blocksOf(m.message)) {
      if (b.type === "text") {
        const text = withoutReminders(b.text ?? "");
        if (text) items.push({ kind: m.type, text });
      } else if (b.type === "tool_use" && b.id) {
        const tool = { kind: "tool" as const, name: b.name ?? "?", input: b.input, result: null, isError: false };
        tools.set(b.id, tool);
        items.push(tool);
      } else if (b.type === "tool_result" && b.tool_use_id) {
        const tool = tools.get(b.tool_use_id);
        if (tool) {
          tool.result = resultText(b.content);
          tool.isError = b.is_error === true;
        }
      }
    }
  }
  return items;
}
