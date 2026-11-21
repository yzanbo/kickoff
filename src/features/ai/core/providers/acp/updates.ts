import type { ProviderCallbacks } from "@/features/ai/core/providers/types";
import { blockText, clipToolResult, setCompacting } from "@/features/ai/core/providers/shared/events";
import type { ToolCall, ToolCallContent } from "./protocol";
import { toolUse } from "@shared/ai/claudeTools";

/**
 * ACP の session/update を Kickoff の記録（ChatEvent）にする。名前と入力の形は Claude Code にそろえる（Codex・Copilot と同じ決まり。
 * 画面のツールの表示・ターンの変更カードが Claude Code の名前を前提にしているため）: 流す = Bash（command）、ファイルの変更 = Write（新しいファイル）/
 * Edit（old_string / new_string）/ 消す = MultiEdit（deleted）、読む = Read、探す = Grep、取ってくる = WebFetch、
 * MCP のツール = mcp__<サーバー>__<ツール>（名前・題にコアの MCP サーバーの名前があれば）
 */

/** 1 回の実行の間だけ持つ変換の状態 */
export interface UpdateState {
  /** ツールの呼び出し（届いた欄を重ねたもの）と、記録に出したか */
  tools: Map<string, { call: ToolCall; emitted: boolean; done: boolean }>;
  /** 書きかけの返答・思考（次の塊の種類が変わったら記録に出す） */
  text: string;
  thought: string;
  /** 最後に出した返答の文（結果の文） */
  lastText: string;
  /** 最後のコンテキストの大きさ */
  usage: { used: number; size: number } | null;
  /** これまでの費用（エージェントが知らせたとき。USD だけ） */
  costUsd: number | undefined;
  compacting: boolean;
  /** 手で頼んだ圧縮か */
  manualCompact: boolean;
  /** コアの MCP サーバーの名前（MCP のツールの見分けに使う） */
  mcpServers: string[];
}

export const createUpdateState = (mcpServers: string[]): UpdateState => ({ tools: new Map(), text: "", thought: "", lastText: "", usage: null, costUsd: undefined, compacting: false, manualCompact: false, mcpServers });

const record = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/** 書きかけの返答・思考を記録に出す */
export function flushText(cb: ProviderCallbacks, state: UpdateState): void {
  if (state.thought.trim()) cb.emit({ type: "thinking", text: state.thought.trim() });
  state.thought = "";
  if (state.text.trim()) {
    cb.emit({ type: "text", text: state.text });
    state.lastText = state.text;
  }
  state.text = "";
}

/** コマンドの文（rawInput の command。配列ならつなぐ。なければ題） */
export function commandOf(call: ToolCall): string {
  const raw = record(call.rawInput);
  const command = raw.command ?? raw.cmd;
  if (Array.isArray(command)) return command.map(String).join(" ");
  return str(command) ?? call.title ?? "";
}

/** 書く・読むファイル（差分・場所・rawInput の file_path / path） */
export function pathsOf(call: ToolCall): string[] {
  const raw = record(call.rawInput);
  const fromDiff = (call.content ?? []).flatMap((c) => (c.type === "diff" ? [c.path] : []));
  const fromLocations = (call.locations ?? []).map((l) => l.path);
  const fromInput = [str(raw.file_path), str(raw.path), str(raw.destination), str(raw.new_path)].filter((p): p is string => Boolean(p));
  return [...new Set([...fromDiff, ...fromLocations, ...fromInput])];
}

/** コアの MCP サーバーのツールなら、サーバーとツールの名前 */
export function mcpToolOf(call: ToolCall, servers: string[]): { server: string; tool: string } | null {
  const label = `${call.name ?? ""} ${call.title ?? ""}`;
  const prefixed = /mcp__([A-Za-z0-9_-]+?)__([A-Za-z0-9_-]+)/.exec(label);
  if (prefixed && servers.includes(prefixed[1])) return { server: prefixed[1], tool: prefixed[2] };
  for (const server of servers) {
    const m = new RegExp(`${server}[/.:_ -]+([A-Za-z0-9_-]+)`).exec(label);
    if (m) return { server, tool: m[1] };
  }
  return null;
}

/** ツールの呼び出しを Claude Code の形（名前・入力）にする（ファイルの変更は差分ごとに分ける） */
export function callAsTools(call: ToolCall, servers: string[]): { name: string; input: Record<string, unknown> }[] {
  const mcp = mcpToolOf(call, servers);
  if (mcp) return [{ name: `mcp__${mcp.server}__${mcp.tool}`, input: record(call.rawInput) }];
  const diffs = (call.content ?? []).filter((c): c is Extract<ToolCallContent, { type: "diff" }> => c.type === "diff");
  const path = pathsOf(call)[0] ?? "";
  switch (call.kind) {
    case "execute":
      return [toolUse.bash(commandOf(call))];
    case "edit":
      if (diffs.length === 0) return [toolUse.edit(path)];
      return diffs.map((d) => (d.oldText == null ? toolUse.write(d.path, d.newText) : toolUse.edit(d.path, { old_string: d.oldText, new_string: d.newText })));
    case "delete":
      return [toolUse.multiEdit(path, [{ old_string: diffs[0]?.oldText ?? "", new_string: "" }], { deleted: true })];
    case "read":
      return [toolUse.read(path)];
    case "search":
      return [toolUse.grep(str(record(call.rawInput).pattern) ?? str(record(call.rawInput).query) ?? call.title ?? "", path || undefined)];
    case "fetch":
      return [toolUse.webFetch(str(record(call.rawInput).url) ?? call.title ?? "")];
    default:
      return [{ name: call.name || call.title || "Tool", input: { ...record(call.rawInput), ...(call.title ? { description: call.title } : {}) } }];
  }
}

/** ツールの結果の文（文の塊・rawOutput。差分は文にしない） */
function resultText(call: ToolCall): string {
  const blocks = (call.content ?? []).flatMap((c) => (c.type === "content" ? [blockText(c.content)] : []));
  if (blocks.length > 0) return blocks.join("\n");
  const out = call.rawOutput;
  if (typeof out === "string") return out;
  const raw = record(out);
  const textOut = str(raw.output) ?? str(raw.stdout) ?? str(raw.text) ?? str(raw.content);
  if (textOut !== undefined) return textOut;
  return out === undefined || out === null ? "" : JSON.stringify(out);
}

/** ファイルを変えるツールは差分が届くまで記録に出さない（Claude Code の編集の形にするため） */
const waitsForDiff = (call: ToolCall) => (call.kind === "edit" || call.kind === "delete") && !(call.content ?? []).some((c) => c.type === "diff") && call.status !== "completed" && call.status !== "failed";

/** ツールの呼び出しが届いた・変わった */
function toolUpdate(update: ToolCall, cb: ProviderCallbacks, state: UpdateState): void {
  flushText(cb, state);
  const entry = state.tools.get(update.toolCallId) ?? { call: { toolCallId: update.toolCallId }, emitted: false, done: false };
  const defined = Object.fromEntries(Object.entries(update).filter(([, v]) => v !== undefined && v !== null)) as Partial<ToolCall>;
  entry.call = { ...entry.call, ...defined };
  state.tools.set(update.toolCallId, entry);
  const call = entry.call;
  if (call.kind === "think") return;
  const tools = callAsTools(call, state.mcpServers);
  const ids = tools.map((_, i) => (tools.length > 1 ? `${call.toolCallId}#${i}` : call.toolCallId));
  if (!entry.emitted && !waitsForDiff(call)) {
    entry.emitted = true;
    tools.forEach((t, i) => cb.emit({ type: "tool_use", id: ids[i], name: t.name, input: t.input }));
  }
  if (entry.emitted && !entry.done && (call.status === "completed" || call.status === "failed")) {
    entry.done = true;
    const failed = call.status === "failed";
    const content = clipToolResult(resultText(call)) || (failed ? "失敗しました" : "");
    for (const id of ids) cb.emit({ type: "tool_result", tool_use_id: id, content, is_error: failed });
  }
}

/** session/update を記録にする（usage・圧縮・返答・思考・ツール。ほかは読み飛ばす） */
export function sessionUpdate(update: Record<string, unknown> & { sessionUpdate: string }, cb: ProviderCallbacks, state: UpdateState): void {
  switch (update.sessionUpdate) {
    case "agent_message_chunk": {
      if (state.thought) flushText(cb, state);
      const chunk = blockText(update.content);
      state.text += chunk;
      cb.stream?.(chunk);
      return;
    }
    case "agent_thought_chunk":
      if (state.text) flushText(cb, state);
      state.thought += blockText(update.content);
      return;
    case "tool_call":
    case "tool_call_update":
      toolUpdate(update as unknown as ToolCall, cb, state);
      return;
    case "usage_update": {
      const used = Number(update.used);
      const size = Number(update.size);
      state.usage = { used, size };
      const cost = update.cost as { amount: number; currency: string } | null | undefined;
      if (cost && cost.currency === "USD") state.costUsd = cost.amount;
      return;
    }
    case "compaction_update": {
      const status = String(update.status);
      if (status === "in_progress") {
        setCompacting(state, cb, true);
        return;
      }
      if (status === "completed") cb.emit({ type: "compact", trigger: state.manualCompact ? "manual" : "auto", pre_tokens: state.usage?.used ?? 0 });
      else if (status === "failed" && update.error) cb.compactFailed?.(String(update.error));
      setCompacting(state, cb, false);
      return;
    }
    case "notice": {
      const title = String(update.title ?? "");
      const description = update.description ? `（${String(update.description)}）` : "";
      if (title) cb.emit({ type: "notice", message: `${title}${description}` });
      return;
    }
  }
}
