import type { RunEvent } from "../../../../core/types";
import { EDIT_TOOLS } from "./timelineItems";
import { describeTool } from "./toolDescribe";
import { baseName } from "../../format";

const SEARCH_TOOLS = new Set(["Grep", "Glob"]);
const WEB_TOOLS = new Set(["WebFetch", "WebSearch"]);

const fileName = (value: unknown) => baseName(String(value ?? ""));
const clip = (text: string, max = 40) => {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > max ? `${line.slice(0, max)}…` : line;
};

/**
 * チャットの記録の 1 件から、いまの作業を短い文にする（サイドバーの作業中のチャットの説明に出す）。
 * 作業の手がかりにならないもの（ツールの結果など）は null
 */
export function describeActivity(event: Pick<RunEvent, "type" | "data">): string | null {
  const data = event.data as Record<string, unknown>;
  if (event.type === "thinking") return "考えています";
  if (event.type === "text") return data.sub ? "サブエージェントが返答を書いています" : "返答を書いています";
  if (event.type === "approval") return "承認を待っています";
  if (event.type !== "tool_use") return null;
  const name = String(data.name ?? "");
  const input = (data.input ?? {}) as Record<string, unknown>;
  const prefix = data.sub ? "サブエージェント: " : "";
  let text: string;
  if (EDIT_TOOLS.has(name)) text = `ファイルを編集: ${fileName(input.file_path ?? input.notebook_path)}`;
  else if (name === "Read") text = `ファイルを読み取り: ${fileName(input.file_path)}`;
  else if (name === "Bash") text = `コマンドを実行: ${clip(String(input.command ?? ""))}`;
  else if (SEARCH_TOOLS.has(name)) text = `検索: ${clip(String(input.pattern ?? ""))}`;
  else if (name === "Agent" || name === "Task") text = `サブエージェントを起動: ${clip(String(input.description ?? ""))}`;
  else if (WEB_TOOLS.has(name)) text = "Web を調べています";
  else text = clip(describeTool(name, input));
  return prefix + text;
}

/** 経過時間の文（作業中のチャットの時刻の代わりに出す。1 分未満は「作業中」だけ） */
export function workingFor(startedAt: string | null, now = Date.now()): string {
  if (!startedAt) return "作業中";
  const minutes = Math.floor((now - new Date(startedAt).getTime()) / 60_000);
  if (minutes < 1) return "作業中";
  if (minutes < 60) return `作業中 ${minutes}分`;
  return `作業中 ${Math.floor(minutes / 60)}時間${minutes % 60 ? `${minutes % 60}分` : ""}`;
}
