import { cleanTerminalText } from "@shared/foundation/text/terminal";
import type { ProviderCallbacks } from "@/features/ai/core/providers/types";
import { clipToolResult, createCommandOutputTail, setCompacting, type CommandOutputTail } from "@/features/ai/core/providers/shared/events";
import type { SessionEvent } from "./sdk";

/**
 * Copilot SDK のセッションのイベントを Kickoff の記録（ChatEvent）にする。名前と入力の形は Claude Code と同じにそろえる
 * （画面のツールの表示・ターンの変更カード・記録の見分けが Claude Code の名前を前提にしているため）:
 * コマンド = Bash（command）、新しいファイル = Write（file_path・content）、置き換え = Edit（file_path・old_string・new_string）、
 * 読む = Read（file_path）、MCP のツール = mcp__<サーバー>__<ツール>。サブエージェントの中のもの（parentToolCallId）はまだ写さない
 */

/** 1 回の実行の間だけ持つ変換の状態 */
export interface EventState {
  /** 実行中のコマンドの出力（届いた分） */
  outputs: CommandOutputTail;
  /** 最後のメインの返答の文 */
  lastText: string;
  /** 最後に記録に残る（ephemeral でない）イベントの ID（分岐の起点） */
  lastEventId: string | null;
  /** コンテキストの大きさ（session.usage_info） */
  usage: { tokens: number; window: number } | null;
  compacting: boolean;
  /** 最後の失敗（session.error） */
  error: { message: string; type: string; code?: string } | null;
}

export const createEventState = (): EventState => ({ outputs: createCommandOutputTail(), lastText: "", lastEventId: null, usage: null, compacting: false, error: null });

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** ツールの呼び出しを Claude Code の名前と入力の形にする */
export function toolAsKickoff(toolName: string, args: unknown, mcp?: { server?: string; tool?: string }): { name: string; input: Record<string, unknown> } {
  const a = args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
  if (mcp?.server && mcp.tool) return { name: `mcp__${mcp.server}__${mcp.tool}`, input: a };
  const command = str(a.command);
  if (command !== null) return { name: "Bash", input: { command } };
  const file = str(a.path) ?? str(a.file_path) ?? str(a.fileName);
  if (file !== null) {
    const content = str(a.file_text) ?? str(a.content);
    if (content !== null) return { name: "Write", input: { file_path: file, content } };
    const oldText = str(a.old_str) ?? str(a.old_string);
    const newText = str(a.new_str) ?? str(a.new_string);
    if (oldText !== null || newText !== null) return { name: "Edit", input: { file_path: file, old_string: oldText ?? "", new_string: newText ?? "" } };
    if (/view|read/i.test(toolName)) return { name: "Read", input: { file_path: file } };
  }
  return { name: toolName, input: a };
}

/** イベントを 1 つ写す（記録・途中経過・作業中の様子） */
export function handleEvent(event: SessionEvent, cb: ProviderCallbacks, state: EventState): void {
  if (!("ephemeral" in event && event.ephemeral)) state.lastEventId = event.id;
  switch (event.type) {
    case "assistant.message_delta":
      if (!event.data.parentToolCallId) cb.stream?.(event.data.deltaContent);
      return;
    case "assistant.message":
      if (event.data.parentToolCallId) return;
      if (event.data.content.trim()) {
        state.lastText = event.data.content;
        cb.emit({ type: "text", text: event.data.content });
      }
      return;
    case "assistant.reasoning":
      if (event.data.content.trim()) cb.emit({ type: "thinking", text: event.data.content });
      return;
    case "tool.execution_start": {
      const d = event.data;
      if (d.parentToolCallId) return;
      const tool = toolAsKickoff(d.toolName, d.arguments, { server: d.mcpServerName, tool: d.mcpToolName });
      cb.emit({ type: "tool_use", id: d.toolCallId, name: tool.name, input: tool.input });
      return;
    }
    case "tool.shell_output": {
      const d = event.data;
      state.outputs.append(d.toolCallId, d.text, cb);
      return;
    }
    case "tool.execution_complete": {
      const d = event.data;
      if (d.parentToolCallId) return;
      state.outputs.take(d.toolCallId);
      const content = d.success ? (d.result?.content ?? "") : (d.error?.message ?? d.result?.content ?? "失敗しました");
      cb.emit({ type: "tool_result", tool_use_id: d.toolCallId, content: clipToolResult(cleanTerminalText(content)), is_error: !d.success });
      return;
    }
    case "session.usage_info":
      state.usage = { tokens: event.data.currentTokens, window: event.data.tokenLimit };
      return;
    case "session.compaction_start":
      setCompacting(state, cb, true);
      return;
    case "session.compaction_complete": {
      const d = event.data;
      // 要約の記録を先に残してから圧縮中を外す（Claude Code と同じ順。圧縮中に預かった「いま」が圧縮の下に並ぶ）
      if (d.success) cb.emit({ type: "compact", trigger: d.trigger === "manual" ? "manual" : "auto", pre_tokens: d.preCompactionTokens ?? state.usage?.tokens ?? 0 });
      else if (d.error || d.failureReason) cb.compactFailed?.(d.error ?? d.failureReason ?? "");
      setCompacting(state, cb, false);
      if (d.success && d.postCompactionTokens !== undefined) cb.context?.(d.postCompactionTokens);
      return;
    }
    case "session.error":
      state.error = { message: event.data.message, type: event.data.errorType, ...(event.data.errorCode ? { code: event.data.errorCode } : {}) };
      return;
  }
}
