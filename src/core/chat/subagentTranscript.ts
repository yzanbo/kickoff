// サブエージェントの会話の記録（Markdown。「サブエージェントに子チャットで聞く」で子チャットに添付し、AI が Read で読む。Node 依存なし）
import type { ChatEvent } from "@shared/types";
import { subagentReport, type SubagentEntry } from "@shared/chat/subagents";
import type { SubagentLogItem } from "../providers/types.js";

/** ツールの結果を書き写す長さの上限（長い出力は頭だけ。記録が大きくなりすぎて読めなくならないように） */
const MAX_RESULT = 1500;
/** ツールの入力を書き写す長さの上限 */
const MAX_INPUT = 400;

/** 記録の見出しに書く状態 */
const STATUS_LABELS: Record<SubagentEntry["status"], string> = { running: "作業中", completed: "終わった", failed: "失敗した", stopped: "止まった" };

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}\n…（以下 ${text.length - max} 文字を省略）` : text);

/** ツールの入力の要点（よく使うツールは中心の値だけ。ほかは JSON） */
function inputSummary(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const i = input as Record<string, unknown>;
  for (const key of ["command", "file_path", "notebook_path", "pattern", "url", "query", "description"]) {
    if (typeof i[key] === "string") return clip(i[key], MAX_INPUT);
  }
  return clip(JSON.stringify(input), MAX_INPUT);
}

/**
 * Claude Code の記録が読めないときに、Kickoff の記録（サブエージェントの中の発言・ツール。parent がこのサブエージェント）から組み立てる。
 * 途中の発言が届かない版・裏で動かしたものもあるので、依頼と報告だけになることもある
 */
export function subagentLogFromEvents(entry: SubagentEntry, events: readonly ChatEvent[]): SubagentLogItem[] {
  const keys = new Set([entry.key, ...(entry.aliases ?? [])]);
  const items: SubagentLogItem[] = entry.prompt ? [{ kind: "user", text: entry.prompt }] : [];
  const tools = new Map<string, Extract<SubagentLogItem, { kind: "tool" }>>();
  for (const e of events) {
    if (e.type === "text" && e.data.parent && keys.has(e.data.parent) && e.data.text.trim()) items.push({ kind: "assistant", text: e.data.text.trim() });
    else if (e.type === "tool_use" && e.data.parent && keys.has(e.data.parent)) {
      const tool = { kind: "tool" as const, name: e.data.name, input: e.data.input, result: null, isError: false };
      tools.set(e.data.id, tool);
      items.push(tool);
    } else if (e.type === "tool_result" && tools.has(e.data.tool_use_id)) {
      const tool = tools.get(e.data.tool_use_id)!;
      tool.result = e.data.content;
      tool.isError = e.data.is_error === true;
    }
  }
  return items;
}

/**
 * サブエージェントの会話を Markdown にする（見出しに名前・種類・状態・どのチャットのものか、本文に依頼・発言・ツールと結果を古い順に、
 * 最後に親への報告）。ツールの入力・結果は長ければ頭だけ
 */
export function subagentTranscript(entry: SubagentEntry, log: readonly SubagentLogItem[], { chatTitle, events }: { chatTitle: string; events: readonly ChatEvent[] }): string {
  const lines = [
    `# サブエージェント「${entry.description}」の会話の記録`,
    "",
    `- チャット「${chatTitle}」のメインのエージェントが起動したサブエージェント（ID: ${entry.agentId ?? "不明"}${entry.subagentType ? `・種類 ${entry.subagentType}` : ""}）`,
    `- 状態: ${STATUS_LABELS[entry.status]}`,
    "",
    "このファイルは、サブエージェントの会話を参照のために書き出したものです。依頼（メインのエージェントから）・サブエージェントの発言・使ったツールと結果を古い順に並べています。ツールの長い出力は頭だけです。",
  ];
  let asked = false;
  for (const item of log) {
    if (item.kind === "user") {
      lines.push("", asked ? "## 追加の指示（メインのエージェントから）" : "## 依頼（メインのエージェントから）", "", item.text);
      asked = true;
    } else if (item.kind === "assistant") lines.push("", "## サブエージェント", "", item.text);
    else {
      const input = inputSummary(item.input);
      lines.push("", `### ツール ${item.name}${item.isError ? "（失敗）" : ""}`, "");
      if (input) lines.push("```", input, "```");
      if (item.result !== null) lines.push("", "結果:", "", "```", clip(item.result.trim(), MAX_RESULT), "```");
    }
  }
  const report = subagentReport(entry, events as ChatEvent[]);
  if (report) lines.push("", "## 親への報告", "", report);
  return `${lines.join("\n")}\n`;
}

/** 添付にするときのファイル名（「サブエージェントの記録-名前.md」。ファイル名に使えない文字は除く） */
export function subagentTranscriptFileName(entry: SubagentEntry): string {
  const name = entry.description.replace(/[\\/:*?"<>|\n\r\t]+/g, " ").trim().slice(0, 60) || "名前なし";
  return `サブエージェントの記録-${name}.md`;
}

/** サブエージェントを動かした親のセッション（その回を始めた記録より前の、いちばん新しい init。なければ undefined） */
export function sessionOfSubagent(entry: SubagentEntry, events: readonly ChatEvent[]): string | undefined {
  const at = entry.startEventId ?? entry.toolUseEventId ?? Number.POSITIVE_INFINITY;
  let session: string | undefined;
  for (const e of events) {
    if (e.id > at) break;
    if (e.type === "init") session = e.data.session_id;
  }
  return session;
}
