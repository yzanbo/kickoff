// ツールの呼び出しを人が読める文にする（タイムラインのツールの行・実行中の表示・承認カードで共通）
import { AI_LIST_FAMILY_TOOL, AI_UPDATE_CHAT_TOOL, describeUpdateChat } from "@shared/chat/aiChatEdit";
import { AI_CHILD_CHAT_TOOL } from "@shared/chat/aiChildChat";
import { isSubagentTool } from "@shared/chat/subagents";

type Input = Record<string, unknown>;

const KICKOFF_PREFIX = "mcp__kickoff__";

const TOOL_LABELS: Record<string, string> = {
  Read: "読む",
  Write: "作成",
  Edit: "編集",
  MultiEdit: "編集",
  NotebookEdit: "編集",
  Bash: "コマンド",
  Grep: "検索",
  Glob: "ファイル検索",
  LS: "一覧",
  WebSearch: "Web 検索",
  WebFetch: "ページを取得",
  TodoWrite: "ToDo",
  TaskCreate: "ToDo を追加",
  TaskUpdate: "ToDo を更新",
  TaskList: "ToDo の一覧",
  TaskGet: "ToDo を確認",
  TaskStop: "作業を停止",
  KillShell: "作業を停止",
  KillBash: "作業を停止",
  TaskOutput: "作業の出力",
  BashOutput: "作業の出力",
  Monitor: "監視",
  AskUserQuestion: "質問",
  Agent: "サブエージェント",
  Task: "サブエージェント",
  SendMessage: "メッセージ",
  SubagentHandback: "報告",
  ToolSearch: "ツール検索",
  Skill: "スキル",
  ExitPlanMode: "計画を提示",
  EnterPlanMode: "計画モード",
  EnterWorktree: "ワークツリーに入る",
  ExitWorktree: "ワークツリーを出る",
  [AI_CHILD_CHAT_TOOL]: "子チャットを作る",
  [AI_LIST_FAMILY_TOOL]: "同じ家系のチャットを確かめる",
  [AI_UPDATE_CHAT_TOOL]: "チャットを変更",
};

/** ToDo の状態の表示名（TaskUpdate の status） */
const TODO_STATUS: Record<string, string> = {
  pending: "未着手",
  in_progress: "作業中",
  completed: "完了",
  deleted: "削除",
};

/** Kickoff の MCP のツール（以前の版の記録に残っている）の文 */
const KICKOFF_TOOLS: Record<string, (input: Input) => string> = {
  create_task: (i) => joinLabel("タスクを作成", str(i.title)),
  list_tasks: () => "タスクの一覧",
  save_artifact: (i) => joinLabel("成果物を保存", str(i.title)),
  list_artifacts: () => "成果物の一覧",
};

const str = (value: unknown): string => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");

/** 1 行目だけを max 文字までにする */
function clip(text: string, max = 60): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

const joinLabel = (label: string, arg: string) => (arg ? `${label}: ${arg}` : label);

/** `mcp__サーバー__ツール` を分ける（MCP のツールでなければ null） */
function splitMcp(name: string): { server: string; tool: string } | null {
  const m = /^mcp__(.+?)__(.+)$/.exec(name);
  return m ? { server: m[1], tool: m[2] } : null;
}

/** ツールの表示名（Kickoff のツールはまとめて「Kickoff」、ほかの MCP のツールはサーバーの名前） */
export function toolLabel(name: string): string {
  if (name.startsWith(KICKOFF_PREFIX)) return "Kickoff";
  return TOOL_LABELS[name] ?? splitMcp(name)?.server ?? name;
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

/** ツールごとの入力の文（ツール名を除いた部分）。null ならツール固有の形がない */
function describeKnown(name: string, input: Input): string | null {
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
    case "KillShell":
    case "KillBash":
    case "TaskOutput":
    case "BashOutput":
      return str(input.task_id ?? input.shell_id ?? input.bash_id);
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
    case AI_CHILD_CHAT_TOOL:
      // 名前があれば名前、なければ依頼の 1 行目（依頼の全文は開いた中身と承認カードで見る）
      return clip(str(input.title) || str(input.text));
    case AI_LIST_FAMILY_TOOL:
      return "";
    case AI_UPDATE_CHAT_TOOL:
      // どのチャットの何を変えたか（引数から。「名前を『…』に変えた・固定した（チャット 12）」）
      return clip(describeUpdateChat(input));
  }
  // サブエージェントは、依頼の概要と種類だけ（依頼の全文は「中身を見る」で見られる）
  if (isSubagentTool(name) && typeof input.description === "string") {
    return typeof input.subagent_type === "string" ? `${input.description}（${input.subagent_type}）` : input.description;
  }
  if (name.startsWith(KICKOFF_PREFIX)) {
    const tool = name.slice(KICKOFF_PREFIX.length);
    const describe = KICKOFF_TOOLS[tool];
    return describe ? describe(input) : joinLabel(tool, describeUnknownInput(input));
  }
  const mcp = splitMcp(name);
  if (mcp) return [mcp.tool, describeUnknownInput(input)].filter(Boolean).join(" ");
  return null;
}

/** ツールの入力を人が読める 1 行にする（ツール名は含めない。表示名は toolLabel） */
export function describeToolInput(name: string, input: Input): string {
  const known = describeKnown(name, input);
  if (known !== null) return known;
  if (typeof input.file_path === "string") return input.file_path;
  if (typeof input.url === "string") return input.url;
  if (typeof input.query === "string") return input.query;
  if (typeof input.pattern === "string") return input.pattern;
  return describeUnknownInput(input);
}

/** 承認カードに出す入力（計画の提示は計画の全文。ほかは describeToolInput と同じ） */
export function describeApprovalInput(name: string, input: Input): string {
  if (name === "ExitPlanMode" && typeof input.plan === "string") return input.plan;
  // AI が子チャットに送る依頼は、確かめられるよう切らずに全文（名前は見出しにある）
  if (name === AI_CHILD_CHAT_TOOL && typeof input.text === "string") return input.text;
  return describeToolInput(name, input);
}

/** 表示名と入力をつないだ 1 文（「ToDo を追加: 確認 1」。実行中のまとまりの見出しに出す） */
export function describeTool(name: string, input: Input): string {
  return joinLabel(toolLabel(name), describeToolInput(name, input));
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
