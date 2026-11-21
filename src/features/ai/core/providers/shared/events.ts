// 各 AI の知らせを Kickoff の記録にするときの共通の小物（Claude・Codex・Copilot・ACP が同じ形で使う）
import { cleanTerminalText, tailLines } from "@shared/foundation/text/terminal";
import type { ProviderCallbacks } from "@/features/ai/core/providers/types";

/** 記録に残すツールの結果の長さの上限（文字） */
const TOOL_RESULT_LIMIT = 4000;
/** 実行中のコマンドの出力として画面に流す最後の行の数 */
const COMMAND_OUTPUT_LINES = 40;
/** 覚えておく実行中のコマンドの出力の終わりの分（文字数。最後の行を作るのに足りる分だけ） */
const KEEP_OUTPUT_CHARS = 64_000;

/** ツールの結果を上限で切る */
export const clipToolResult = (text: string): string => (text.length > TOOL_RESULT_LIMIT ? `${text.slice(0, TOOL_RESULT_LIMIT)}\n…（省略）` : text);

/** 中身のブロック 1 つを文にする（文はそのまま、ほかは種類だけ） */
export function blockText(block: unknown): string {
  const b = block && typeof block === "object" && !Array.isArray(block) ? (block as { type?: unknown; text?: unknown }) : null;
  if (b?.type === "text" && typeof b.text === "string") return b.text;
  return `[${b ? String(b.type ?? "?") : "?"}]`;
}

/** ツールの結果などの中身を文にする（文ならそのまま、ブロックの並びは 1 行ずつ、ほかは空） */
export function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  return Array.isArray(content) ? content.map(blockText).join("\n") : "";
}

/** 実行中のコマンドの出力から、画面に流す最後の行を作る */
export const outputTail = (raw: string): string => tailLines(cleanTerminalText(raw), COMMAND_OUTPUT_LINES);

/** 実行中のコマンドの出力（呼び出しごとに届いた分を足し、最後の行を画面に流す。保存しない） */
export function createCommandOutputTail() {
  const outputs = new Map<string, string>();
  return {
    /** 届いた分を足して、最後の行を知らせる */
    append(id: string, delta: string, cb: Pick<ProviderCallbacks, "commandOutput">): void {
      const raw = (outputs.get(id) ?? "") + delta;
      outputs.set(id, raw.slice(-KEEP_OUTPUT_CHARS));
      cb.commandOutput?.({ tool_use_id: id, task_id: id, text: outputTail(raw) });
    },
    /** 届いた分を取り出して忘れる（結果を作るとき） */
    take(id: string): string | undefined {
      const raw = outputs.get(id);
      outputs.delete(id);
      return raw;
    },
  };
}
export type CommandOutputTail = ReturnType<typeof createCommandOutputTail>;

/** 圧縮している最中かが変わったときだけ知らせる */
export function setCompacting(state: { compacting: boolean }, cb: Pick<ProviderCallbacks, "compacting">, active: boolean): void {
  if (state.compacting === active) return;
  state.compacting = active;
  cb.compacting?.(active);
}
