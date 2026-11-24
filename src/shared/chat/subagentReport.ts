// サブエージェントの親への報告を記録から探す（画面の一覧・コアの記録の書き出しで共有する。Node 依存なし）
import type { ChatEvent } from "@shared/chat/chatEvent";
import type { SubagentEntry } from "./subagents";

/** 終わりの知らせの要約が、報告そのものでなく「報告は別の知らせ（SubagentHandback）で届けた」という案内か */
const isHandbackPointer = (text: string) => /report was delivered to you as a message/i.test(text);

/**
 * サブエージェントの親への報告（いちばん新しいもの）。次の順に探す:
 * 1. サブエージェントが呼んだ SubagentHandback の本文（再開したら、その回のもの。その回の記録の parent は再開を頼んだ呼び出し = aliases）
 * 2. 終わりの知らせの要約（「別の知らせで届けた」という案内は除く）
 */
export function subagentReport(entry: Pick<SubagentEntry, "key" | "aliases" | "summary">, events: ChatEvent[]): string | undefined {
  const keys = new Set([entry.key, ...(entry.aliases ?? [])]);
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type !== "tool_use" || e.data.parent === undefined || !keys.has(e.data.parent) || e.data.name !== "SubagentHandback") continue;
    const message = (e.data.input as { message?: string } | undefined)?.message;
    if (message) return message;
  }
  return entry.summary && !isHandbackPointer(entry.summary) ? entry.summary : undefined;
}
