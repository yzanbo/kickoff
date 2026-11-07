// 起動したときの送信待ちの確かめに添える「止まったところ」（最後の自分の指示・メインエージェントの最後の返答・最後に動かしたツール）
import type { ChatEvent, QueueResumeMoment } from "@shared/types";

/** 返答の頭だけを見せる長さ（文字） */
const REPLY_MAX = 600;
/** 指示の頭だけを見せる長さ（文字） */
const PROMPT_MAX = 600;
/** ツールの中身の頭だけを見せる長さ（文字） */
const TOOL_MAX = 160;
/** ツールの入力のうち、何をしたかが分かる項目（見つかった最初のもの） */
const TOOL_INPUT_KEYS = ["command", "file_path", "path", "pattern", "url", "query", "description", "prompt"] as const;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

/** ツールの呼び出しを 1 行にする（「Bash: npm test」。中身が分からなければ名前だけ） */
export function toolLine(name: string, input: unknown): string {
  if (input && typeof input === "object") {
    for (const key of TOOL_INPUT_KEYS) {
      const value = (input as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) return `${name}: ${clip(value.trim().replace(/\s+/g, " "), TOOL_MAX)}`;
    }
  }
  return name;
}

/**
 * 新しい順の記録から、止まったところを拾う（サブエージェントのものは除く）。
 * 最後の自分の指示より前の返答・ツールは、前の作業のものなので拾わない
 */
export function resumeMomentsOf(recent: ChatEvent[]): {
  last_prompt: QueueResumeMoment | null;
  last_reply: QueueResumeMoment | null;
  last_tool: QueueResumeMoment | null;
  stopped_at: string | null;
} {
  let lastPrompt: QueueResumeMoment | null = null;
  let lastReply: QueueResumeMoment | null = null;
  let lastTool: QueueResumeMoment | null = null;
  for (const e of recent) {
    if (e.type === "user") {
      lastPrompt = { text: clip(e.data.text, PROMPT_MAX), at: e.created_at };
      break;
    }
    if (e.type === "text" && !e.data.parent && !lastReply && e.data.text.trim()) lastReply = { text: clip(e.data.text.trim(), REPLY_MAX), at: e.created_at };
    if (e.type === "tool_use" && !e.data.parent && !lastTool) lastTool = { text: toolLine(e.data.name, e.data.input), at: e.created_at };
  }
  return { last_prompt: lastPrompt, last_reply: lastReply, last_tool: lastTool, stopped_at: recent[0]?.created_at ?? null };
}
