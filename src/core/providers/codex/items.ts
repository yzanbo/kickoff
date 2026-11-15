import { COMMAND_OUTPUT_LINES } from "@shared/types";
import type { ProviderCallbacks } from "../types.js";
import { cleanTerminalText, tailLines } from "../claude/commandOutput.js";
import type { FileUpdateChange, JsonValue, ThreadItem, ThreadTokenUsage } from "./protocol.js";

/**
 * Codex の会話の項目（ThreadItem）を Kickoff の記録（ChatEvent）にする。名前と入力の形は Claude Code と同じにそろえる
 * （画面のツールの表示・ターンの変更カード・記録の見分けが Claude Code の名前を前提にしているため）:
 * コマンド = Bash（command）、ファイルの変更 = Write（足した）/ MultiEdit（変えた・消した。差分の塊ごとに old_string / new_string）、
 * MCP のツール = mcp__<サーバー>__<ツール>、Web の検索 = WebSearch
 */

const TOOL_RESULT_LIMIT = 4000;

/** 1 回の実行の間だけ持つ変換の状態 */
export interface ItemState {
  /** コマンドの出力（実行中に届いた分） */
  outputs: Map<string, string>;
  /** 最後のトークン数（圧縮の前の大きさ・結果のコンテキストの大きさ） */
  usage: ThreadTokenUsage | null;
  /** 圧縮中か */
  compacting: boolean;
  /** 手で頼んだ圧縮（thread/compact/start）か */
  manualCompact: boolean;
}

export const createItemState = (): ItemState => ({ outputs: new Map(), usage: null, compacting: false, manualCompact: false });

const clip = (text: string) => (text.length > TOOL_RESULT_LIMIT ? `${text.slice(0, TOOL_RESULT_LIMIT)}\n…（省略）` : text);

/** 統一差分の塊ごとの置き換え（文脈の行は両方に、- は前だけ、+ は後ろだけ）。差分でなければ全体を足したものとみなす */
export function diffEdits(diff: string): { old_string: string; new_string: string }[] {
  const lines = diff.replace(/\n$/, "").split("\n");
  if (!lines.some((l) => l.startsWith("@@"))) return [{ old_string: "", new_string: lines.map((l) => (l.startsWith("+") ? l.slice(1) : l)).join("\n") }];
  const edits: { old: string[]; next: string[] }[] = [];
  for (const line of lines) {
    if (line.startsWith("@@")) edits.push({ old: [], next: [] });
    else if (edits.length === 0 || line.startsWith("---") || line.startsWith("+++") || line.startsWith("\\")) continue;
    else if (line.startsWith("-")) edits.at(-1)!.old.push(line.slice(1));
    else if (line.startsWith("+")) edits.at(-1)!.next.push(line.slice(1));
    else {
      const ctx = line.startsWith(" ") ? line.slice(1) : line;
      edits.at(-1)!.old.push(ctx);
      edits.at(-1)!.next.push(ctx);
    }
  }
  return edits.map((e) => ({ old_string: e.old.join("\n"), new_string: e.next.join("\n") }));
}

/** ファイルの変更 1 つを、Claude Code の編集のツールの呼び出しの形にする */
export function changeAsTool(change: FileUpdateChange): { name: string; input: Record<string, unknown> } {
  if (change.kind.type === "add") {
    return { name: "Write", input: { file_path: change.path, content: diffEdits(change.diff).map((e) => e.new_string).join("\n") } };
  }
  if (change.kind.type === "delete") {
    return { name: "MultiEdit", input: { file_path: change.path, edits: [{ old_string: diffEdits(change.diff).map((e) => e.old_string || e.new_string).join("\n"), new_string: "" }], deleted: true } };
  }
  return { name: "MultiEdit", input: { file_path: change.path, edits: diffEdits(change.diff), ...(change.kind.move_path ? { move_path: change.kind.move_path } : {}) } };
}

/** MCP の結果の中身を文にする（文はそのまま、ほかは種類だけ） */
function mcpText(content: JsonValue[]): string {
  return content
    .map((c) => (c && typeof c === "object" && !Array.isArray(c) && c.type === "text" && typeof c.text === "string" ? c.text : `[${c && typeof c === "object" && !Array.isArray(c) ? String(c.type) : "?"}]`))
    .join("\n");
}

/** 項目が始まった（ツールの呼び出しを記録する・圧縮中を立てる） */
export function itemStarted(item: ThreadItem, cb: ProviderCallbacks, state: ItemState): void {
  switch (item.type) {
    case "commandExecution": {
      const it = item as Extract<ThreadItem, { type: "commandExecution" }>;
      cb.emit({ type: "tool_use", id: it.id, name: "Bash", input: { command: it.command } });
      return;
    }
    case "mcpToolCall": {
      const it = item as Extract<ThreadItem, { type: "mcpToolCall" }>;
      cb.emit({ type: "tool_use", id: it.id, name: `mcp__${it.server}__${it.tool}`, input: it.arguments });
      return;
    }
    case "contextCompaction":
      if (!state.compacting) {
        state.compacting = true;
        cb.compacting?.(true);
      }
      return;
  }
}

/** 項目が終わった（文・思考・ツールの結果を記録する） */
export function itemCompleted(item: ThreadItem, cb: ProviderCallbacks, state: ItemState): void {
  switch (item.type) {
    case "agentMessage": {
      const text = (item as Extract<ThreadItem, { type: "agentMessage" }>).text;
      if (text.trim()) cb.emit({ type: "text", text });
      return;
    }
    case "reasoning": {
      const it = item as Extract<ThreadItem, { type: "reasoning" }>;
      const text = [...it.summary, ...it.content].join("\n\n").trim();
      const duration = it.startedAtMs && it.completedAtMs ? it.completedAtMs - it.startedAtMs : undefined;
      if (text || duration !== undefined) cb.emit({ type: "thinking", text, ...(duration !== undefined ? { duration_ms: duration } : {}) });
      return;
    }
    case "commandExecution": {
      const it = item as Extract<ThreadItem, { type: "commandExecution" }>;
      const output = it.aggregatedOutput ?? state.outputs.get(it.id) ?? "";
      state.outputs.delete(it.id);
      const failed = it.status === "failed" || it.status === "declined" || (it.exitCode !== null && it.exitCode !== 0);
      const declined = it.status === "declined" ? "（実行を断りました）" : "";
      cb.emit({ type: "tool_result", tool_use_id: it.id, content: clip(`${cleanTerminalText(output)}${declined}`), is_error: failed });
      return;
    }
    case "fileChange": {
      const it = item as Extract<ThreadItem, { type: "fileChange" }>;
      const failed = it.status !== "completed";
      it.changes.forEach((change, i) => {
        const id = it.changes.length > 1 ? `${it.id}#${i}` : it.id;
        const tool = changeAsTool(change);
        cb.emit({ type: "tool_use", id, name: tool.name, input: tool.input });
        const content = failed ? `変更を当てられませんでした（${it.status}）` : change.kind.type === "add" ? `File created successfully at: ${change.path}` : `The file ${change.path} has been updated.`;
        cb.emit({ type: "tool_result", tool_use_id: id, content, is_error: failed });
      });
      return;
    }
    case "mcpToolCall": {
      const it = item as Extract<ThreadItem, { type: "mcpToolCall" }>;
      const content = it.error ? it.error.message : mcpText(it.result?.content ?? []);
      cb.emit({ type: "tool_result", tool_use_id: it.id, content: clip(content), is_error: Boolean(it.error) || it.status === "failed" });
      return;
    }
    case "webSearch": {
      const it = item as Extract<ThreadItem, { type: "webSearch" }>;
      cb.emit({ type: "tool_use", id: it.id, name: "WebSearch", input: { query: it.query ?? "" } });
      cb.emit({ type: "tool_result", tool_use_id: it.id, content: "", is_error: false });
      return;
    }
    case "contextCompaction": {
      // 要約の記録を先に残してから圧縮中を外す（Claude Code と同じ順。圧縮中に預かった「いま」が圧縮の下に並ぶ）
      cb.emit({ type: "compact", trigger: state.manualCompact ? "manual" : "auto", pre_tokens: state.usage?.last.totalTokens ?? 0 });
      if (state.compacting) {
        state.compacting = false;
        cb.compacting?.(false);
      }
      return;
    }
  }
}

/** 実行中のコマンドの出力が増えた（最後の行を画面に流す。保存しない） */
export function commandOutputDelta(itemId: string, delta: string, cb: ProviderCallbacks, state: ItemState): void {
  const raw = (state.outputs.get(itemId) ?? "") + delta;
  state.outputs.set(itemId, raw.slice(-64_000));
  cb.commandOutput?.({ tool_use_id: itemId, task_id: itemId, text: tailLines(cleanTerminalText(raw), COMMAND_OUTPUT_LINES) });
}
