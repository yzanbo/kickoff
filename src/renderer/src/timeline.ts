// チャットのタイムラインの組み立て（イベント → 表示の単位）
import type { RunEvent } from "../../core/types";

export interface ToolCall {
  use: RunEvent;
  result?: RunEvent;
}

export type TimelineItem = { kind: "event"; key: string; event: RunEvent } | { kind: "tools"; key: string; tools: ToolCall[] };

/**
 * 連続するツールの実行を 1 つのまとまりにする（結果は対応する呼び出しにぶら下げる）。
 * parent を渡すとそのサブエージェントの中身だけ、渡さなければ親のエージェントの分だけを並べる
 */
export function groupEvents(events: RunEvent[], parent?: string): TimelineItem[] {
  const items: TimelineItem[] = [];
  const byId = new Map<string, ToolCall>();
  for (const e of events) {
    if (((e.data as { parent?: string }).parent ?? undefined) !== parent) continue;
    if (e.type === "tool_use") {
      const call: ToolCall = { use: e };
      byId.set((e.data as { id: string }).id, call);
      const last = items[items.length - 1];
      if (last?.kind === "tools") last.tools.push(call);
      else items.push({ kind: "tools", key: `t${e.id}`, tools: [call] });
    } else if (e.type === "tool_result") {
      const call = byId.get((e.data as { tool_use_id: string }).tool_use_id);
      if (call) call.result = e;
    } else if (e.type === "init" || e.type === "approval" || e.type === "thinking" || e.type === "subagent") {
      // 表示しない（thinking は既定で中身が空。サブエージェントはチャット欄の下の一覧で見せる）
    } else {
      items.push({ kind: "event", key: `e${e.id}`, event: e });
    }
  }
  return items;
}

const TOOL_LABELS: Record<string, string> = {
  Read: "読む",
  Write: "作成",
  Edit: "編集",
  MultiEdit: "編集",
  NotebookEdit: "編集",
  Bash: "コマンド",
  Grep: "検索",
  Glob: "ファイル検索",
  WebSearch: "Web 検索",
  WebFetch: "Web 取得",
  TodoWrite: "ToDo",
  AskUserQuestion: "質問",
  Agent: "サブエージェント",
  Task: "サブエージェント",
  ToolSearch: "ツール検索",
};

/** ツールの表示名（Kickoff のツールはまとめて「Kickoff」） */
export function toolLabel(name: string): string {
  if (name.startsWith("mcp__kickoff__")) return "Kickoff";
  return TOOL_LABELS[name] ?? name;
}

/** 表示用にリポジトリの絶対パスを相対パスにする */
export function relativize(text: string, repo: string): string {
  return text.split(`${repo}/`).join("").split(repo).join(".");
}
