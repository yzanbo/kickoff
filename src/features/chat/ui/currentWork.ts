import type { ChatEvent } from "@shared/chat/chatEvent";
import { toolKindOf, type ToolKind } from "@shared/ai/claudeTools";
import { clip } from "@shared/chat/toolText";
import { baseName } from "@/foundation/ui/lib/format";
import { toolText } from "./tools/toolText";

type Input = Record<string, unknown>;
const fileName = (value: unknown) => baseName(String(value ?? ""));
const short = (value: unknown) => clip(String(value ?? ""), 40);

/** ツールの種類ごとの、いまの作業の文（ない種類は toolText の 1 文） */
const WORK_TEXT: Partial<Record<ToolKind, (input: Input) => string>> = {
  edit: (input) => `ファイルを編集: ${fileName(input.file_path ?? input.notebook_path)}`,
  read: (input) => `ファイルを読み取り: ${fileName(input.file_path)}`,
  command: (input) => `コマンドを実行: ${short(input.command)}`,
  search: (input) => `検索: ${short(input.pattern)}`,
  subagent: (input) => `サブエージェントを起動: ${short(input.description)}`,
  webSearch: () => "Web を調べています",
  fetch: () => "Web を調べています",
};

/**
 * チャットの記録の 1 件から、いまの作業を短い文にする（サイドバーの作業中のチャットの説明に出す）。
 * 作業の手がかりにならないもの（ツールの結果など）は null
 */
export function describeActivity(event: Pick<ChatEvent, "type" | "data">): string | null {
  const e = event as ChatEvent;
  if (e.type === "thinking") return "考えています";
  if (e.type === "text") return e.data.parent ? "サブエージェントが返答を書いています" : "返答を書いています";
  if (e.type === "approval") return "承認を待っています";
  if (e.type !== "tool_use") return null;
  const name = e.data.name;
  const input = (e.data.input ?? {}) as Input;
  const prefix = e.data.parent ? "サブエージェント: " : "";
  const kind = toolKindOf(name);
  const work = kind && WORK_TEXT[kind];
  return prefix + (work ? work(input) : short(toolText().describeTool(name, input)));
}

/** 経過時間の文（作業中のチャットの時刻の代わりに出す。1 分未満は「作業中」だけ） */
export function workingFor(startedAt: string | null, now = Date.now()): string {
  if (!startedAt) return "作業中";
  const minutes = Math.floor((now - new Date(startedAt).getTime()) / 60_000);
  if (minutes < 1) return "作業中";
  if (minutes < 60) return `作業中 ${minutes}分`;
  return `作業中 ${Math.floor(minutes / 60)}時間${minutes % 60 ? `${minutes % 60}分` : ""}`;
}
