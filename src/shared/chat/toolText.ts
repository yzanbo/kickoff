// ツールの呼び出しを人が読める文にする（タイムラインのツールの行・実行中の表示・承認カードで共通）。
// Claude Code のツールは @shared/ai/claudeTools の表、Kickoff のツールは各機能の表（AiToolView。束ねは src/app/shared/aiToolViews.ts）を受けて引く
import { claudeToolLabel, isEditTool, isSubagentTool, toolKindOf, type ToolKind } from "@shared/ai/claudeTools";
import { aiToolId, type AiToolView } from "@shared/foundation/aiToolView";
import { isCreateChatTool } from "./aiCreateChat";

type Input = Record<string, unknown>;

export interface ToolText {
  /** 表示名（表にない MCP のツールはサーバーの名前） */
  toolLabel(name: string): string;
  /** 表示名と入力をつないだ 1 文（「ToDo を追加: 確認 1」。実行中のまとまりの見出しに出す） */
  describeTool(name: string, input: Input): string;
  /** 入力の 1 行（ツール名は含めない） */
  describeToolInput(name: string, input: Input): string;
  /** 承認カードに出す入力（計画の提示は計画の全文。ほかは describeToolInput と同じ） */
  describeApprovalInput(name: string, input: Input): string;
  /** まとまりで何をしたかを 1 文にする（「2個のファイルを編集 および 3個のコマンドを実行」） */
  summarizeTools(calls: readonly ToolCallText[]): string;
}

/** 要約に数える 1 回の呼び出し（id はファイルのないツールの数え分け） */
export interface ToolCallText {
  name: string;
  input?: unknown;
  id: number;
}

/** ToDo の状態の表示名（TaskUpdate の status） */
const TODO_STATUS: Record<string, string> = {
  pending: "未着手",
  in_progress: "作業中",
  completed: "完了",
  deleted: "削除",
};

const str = (value: unknown): string => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");

/** 1 行目だけを max 文字までにする */
export function clip(text: string, max = 60): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

const joinLabel = (label: string, arg: string) => (arg ? `${label}: ${arg}` : label);

/** `mcp__サーバー__ツール` を分ける（MCP のツールでなければ null） */
function splitMcp(name: string): { server: string; tool: string } | null {
  const m = /^mcp__(.+?)__(.+)$/.exec(name);
  return m ? { server: m[1], tool: m[2] } : null;
}

/** 知らないツールの入力を `key: value` の短い列にする（長い値は省き、配列は件数だけ） */
export function describeUnknownInput(input: Input, maxPairs = 4): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === "") continue;
    let text: string;
    if (typeof value === "string") text = clip(value.replace(/\s+/g, " "), 40);
    else if (Array.isArray(value)) text = `${value.length}件`;
    else if (typeof value === "object") text = "{…}";
    else text = String(value);
    pairs.push(`${key}: ${text}`);
  }
  if (pairs.length > maxPairs) return `${pairs.slice(0, maxPairs).join("、")} …`;
  return pairs.join("、");
}

/** TodoWrite の ToDo の件数（「5件（完了 2・作業中 1）」） */
function describeTodos(todos: unknown): string {
  if (!Array.isArray(todos)) return "";
  const count = (status: string) => todos.filter((t) => (t as { status?: string } | null)?.status === status).length;
  const detail = [count("completed") > 0 && `完了 ${count("completed")}`, count("in_progress") > 0 && `作業中 ${count("in_progress")}`].filter(Boolean);
  return `${todos.length}件${detail.length > 0 ? `（${detail.join("・")}）` : ""}`;
}

/** TaskUpdate の変更（「#1 → 完了（名前: 新しい名前）」） */
function describeTaskUpdate(input: Input): string {
  const id = str(input.taskId);
  const status = str(input.status);
  let text = id ? `#${id}` : "";
  if (status) text += `${text ? " " : ""}→ ${TODO_STATUS[status] ?? status}`;
  const extras = [
    str(input.subject) && `名前: ${clip(str(input.subject), 40)}`,
    str(input.description) && "説明を変更",
    str(input.owner) && `担当: ${str(input.owner)}`,
    Array.isArray(input.addBlockedBy) && input.addBlockedBy.length > 0 && `${input.addBlockedBy.map((b) => `#${String(b)}`).join("・")} の後`,
    Array.isArray(input.addBlocks) && input.addBlocks.length > 0 && `${input.addBlocks.map((b) => `#${String(b)}`).join("・")} の前`,
  ].filter(Boolean);
  return extras.length > 0 ? `${text}（${extras.join("・")}）` : text;
}

/** ToolSearch の検索語（`select:A,B` は名前の列にする） */
function describeToolSearch(query: string): string {
  if (!query.startsWith("select:")) return query;
  return query
    .slice("select:".length)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
}

/** AskUserQuestion の最初の質問（ほかにもあれば件数を添える） */
function describeQuestions(questions: unknown): string {
  if (!Array.isArray(questions) || questions.length === 0) return "";
  const first = clip(str((questions[0] as { question?: unknown } | null)?.question));
  return questions.length > 1 ? `${first}（ほか ${questions.length - 1} 件）` : first;
}

/** Claude Code のツールごとの入力の文（ツール名を除いた部分）。null ならツール固有の形がない */
function describeClaude(name: string, input: Input): string | null {
  switch (name) {
    case "Bash":
      return typeof input.command === "string" ? input.command : null;
    case "Grep":
    case "Glob": {
      const pattern = str(input.pattern);
      const path = str(input.path);
      return path ? `${pattern}（${path}）` : pattern;
    }
    case "NotebookEdit": {
      const cell = str(input.cell_id);
      return `${str(input.notebook_path)}${cell ? `（セル ${cell}）` : ""}`;
    }
    case "WebFetch":
      return str(input.url);
    case "WebSearch":
      return str(input.query);
    case "TodoWrite":
      return describeTodos(input.todos);
    case "TaskCreate":
      return clip(str(input.subject));
    case "TaskUpdate":
      return describeTaskUpdate(input);
    case "TaskList":
      return "";
    case "TaskGet":
      return str(input.taskId) ? `#${str(input.taskId)}` : "";
    case "TaskStop":
    case "TaskOutput":
      return str(input.task_id ?? input.shell_id);
    case "Monitor":
      return clip(str(input.description) || str(input.command));
    case "SendMessage": {
      const to = str(input.to);
      const body = clip(str(input.summary) || str(input.message), 50);
      return to ? `${to}: ${body}` : body;
    }
    case "SubagentHandback":
      return clip(str(input.message));
    case "ToolSearch":
      return describeToolSearch(str(input.query));
    case "Skill":
      return [str(input.skill), clip(str(input.args), 40)].filter(Boolean).join(" ");
    case "ExitPlanMode":
      // 計画の見出し（最初の行）だけ。全文は承認のときに見る
      return clip(str(input.plan).replace(/^#+\s*/, ""));
    case "EnterPlanMode":
      return "";
    case "AskUserQuestion":
      return describeQuestions(input.questions);
  }
  // サブエージェントは、依頼の概要と種類だけ（依頼の全文は「中身を見る」で見られる）
  if (isSubagentTool(name) && typeof input.description === "string") {
    return typeof input.subagent_type === "string" ? `${input.description}（${input.subagent_type}）` : input.description;
  }
  return null;
}

/** 回数で数えるツールの種類（並びは要約に出す順。先頭のコマンドの次に、ファイルの読み取りを挟む。編集・読み取りはファイルの数で数える） */
const COUNTED_KINDS: readonly { kinds: readonly ToolKind[]; text: (n: number) => string }[] = [
  { kinds: ["command"], text: (n) => `${n}個のコマンドを実行` },
  { kinds: ["search", "webSearch"], text: (n) => `${n}回検索` },
  { kinds: ["fetch"], text: (n) => `${n}件のページを取得` },
  { kinds: ["todoAdd"], text: (n) => `ToDo を${n}件追加` },
  { kinds: ["todoUpdate"], text: (n) => `ToDo を${n}件更新` },
  { kinds: ["todoCheck"], text: (n) => `ToDo を${n}回確認` },
  { kinds: ["toolSearch"], text: (n) => `ツールを${n}回検索` },
  { kinds: ["skill"], text: (n) => `スキルを${n}回使用` },
  { kinds: ["subagent"], text: (n) => `サブエージェントを${n}件起動` },
  { kinds: ["message"], text: (n) => `メッセージを${n}件送信` },
  { kinds: ["watch"], text: (n) => `作業の様子を${n}回確認` },
  { kinds: ["stop"], text: (n) => `作業を${n}件停止` },
  { kinds: ["question"], text: (n) => `${n}件の質問` },
  { kinds: ["plan"], text: (n) => `計画を${n}回提示` },
];
const COUNT_OF = new Map(COUNTED_KINDS.flatMap((c, i) => c.kinds.map((kind) => [kind, i] as const)));

/** まとまりの要約（編集・読み取りはファイルの数、それ以外は種類ごとの回数。分類できないものだけ「その他」） */
function summarizeTools(calls: readonly ToolCallText[]): string {
  const edited = new Set<string>();
  const read = new Set<string>();
  const counts = COUNTED_KINDS.map(() => 0);
  let kickoff = 0;
  let mcp = 0;
  let others = 0;
  for (const t of calls) {
    const input = (t.input ?? {}) as Input;
    const file = String(input.file_path ?? input.notebook_path ?? t.id);
    const kind = toolKindOf(t.name);
    const counted = kind === null ? undefined : COUNT_OF.get(kind);
    if (isEditTool(t.name)) edited.add(file);
    else if (kind === "read") read.add(file);
    else if (counted !== undefined) counts[counted] += 1;
    else if (t.name.startsWith("mcp__kickoff_")) kickoff += 1;
    else if (t.name.startsWith("mcp__")) mcp += 1;
    else others += 1;
  }
  const [commands, ...rest] = COUNTED_KINDS.map((c, i) => (counts[i] > 0 ? c.text(counts[i]) : ""));
  const parts = [
    edited.size > 0 && `${edited.size}個のファイルを編集`,
    commands,
    read.size > 0 && `${read.size}個のファイルを読み取り`,
    ...rest,
    kickoff > 0 && `Kickoff を${kickoff}回使用`,
    mcp > 0 && `MCP のツールを${mcp}回使用`,
    others > 0 && `その他のツールを${others}回使用`,
  ].filter((part): part is string => Boolean(part));
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join("、")} および ${parts[parts.length - 1]}`;
}

/** Kickoff のツールの表（各機能の AiToolView）を受けて、ツールの文の関数を作る */
export function createToolText(kickoff: readonly AiToolView[]): ToolText {
  const views = new Map(kickoff.map((v) => [aiToolId(v), v]));
  const toolLabel = (name: string) => claudeToolLabel(name) ?? views.get(name)?.label ?? splitMcp(name)?.server ?? name;
  const describeToolInput = (name: string, input: Input): string => {
    // 表で持つ Kickoff のツールは表の 1 文
    const view = views.get(name);
    if (view) return clip(view.describe?.(input) ?? "");
    const known = describeClaude(name, input);
    if (known !== null) return known;
    const mcp = splitMcp(name);
    if (mcp) return [mcp.tool, describeUnknownInput(input)].filter(Boolean).join(" ");
    if (typeof input.file_path === "string") return input.file_path;
    if (typeof input.url === "string") return input.url;
    if (typeof input.query === "string") return input.query;
    if (typeof input.pattern === "string") return input.pattern;
    return describeUnknownInput(input);
  };
  return {
    toolLabel,
    describeToolInput,
    describeTool: (name, input) => joinLabel(toolLabel(name), describeToolInput(name, input)),
    describeApprovalInput: (name, input) => {
      if (name === "ExitPlanMode" && typeof input.plan === "string") return input.plan;
      // AI が作るチャットに送る依頼は、確かめられるよう切らずに全文（何を作るか・名前・作業場所は見出しと説明にある）
      if (isCreateChatTool(name) && typeof input.text === "string") return input.text;
      return describeToolInput(name, input);
    },
    summarizeTools,
  };
}

/** ツールの結果のうち、結果の欄に出す文（ツール検索の `[tool_reference]` のような意味のない行は除く。何も残らなければ空） */
export function visibleToolResult(content: string): string {
  if (!content.includes("[tool_reference]")) return content;
  return content
    .split("\n")
    .filter((line) => line.trim() !== "[tool_reference]")
    .join("\n")
    .trim();
}
