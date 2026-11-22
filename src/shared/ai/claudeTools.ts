// Claude Code のツールの語彙（表示名・種類・ファイルの欄・守りが読む欄）。ほかの AI の記録も Claude Code の名前と入力の形で届くので、
// コアの写し先・守り・画面・スマホがこの表 1 つを読む。種類は、まとまりの要約で数える単位・いまの作業の文・編集の印・サブエージェントか、を決める

/** ツールの種類（要約の数え方といまの作業の文が分ける単位） */
export type ToolKind =
  | "command"
  | "read"
  | "edit"
  | "search"
  | "webSearch"
  | "fetch"
  | "todoAdd"
  | "todoUpdate"
  | "todoCheck"
  | "toolSearch"
  | "skill"
  | "subagent"
  | "message"
  | "watch"
  | "stop"
  | "question"
  | "plan"
  | "other";

/** 守りが読む欄（パスを取るツールだけ） */
interface GuardSpec {
  /** 入力のパスの欄（パスを取らないツールは null） */
  pathKey: string | null;
  /** ファイルを書き換えるか */
  writes: boolean;
  /** パスが探す場所か（Glob・Grep。ファイルを開かない） */
  searches: boolean;
}

export interface ClaudeToolSpec {
  /** ツールの行の表示名 */
  label: string;
  kind: ToolKind;
  /** 記録の索引が呼び出しと結果を丸ごと入れる（サブエージェントの起動・報告・ToDo） */
  indexed?: true;
  /** 守りが読む欄（なければ守りの表にないツール） */
  guard?: GuardSpec;
}

const READS = (pathKey: string): GuardSpec => ({ pathKey, writes: false, searches: false });
const WRITES = (pathKey: string): GuardSpec => ({ pathKey, writes: true, searches: false });
const SEARCHES: GuardSpec = { pathKey: "path", writes: false, searches: true };

export const CLAUDE_CODE_TOOLS: { readonly [name: string]: ClaudeToolSpec } = {
  Read: { label: "読む", kind: "read", guard: READS("file_path") },
  Write: { label: "作成", kind: "edit", guard: WRITES("file_path") },
  Edit: { label: "編集", kind: "edit", guard: WRITES("file_path") },
  // Codex・ACP の記録が使う
  MultiEdit: { label: "編集", kind: "edit", guard: WRITES("file_path") },
  NotebookEdit: { label: "編集", kind: "edit", guard: WRITES("notebook_path") },
  Bash: { label: "コマンド", kind: "command", guard: { pathKey: null, writes: false, searches: false } },
  Grep: { label: "検索", kind: "search", guard: SEARCHES },
  Glob: { label: "ファイル検索", kind: "search", guard: SEARCHES },
  WebSearch: { label: "Web 検索", kind: "webSearch" },
  WebFetch: { label: "ページを取得", kind: "fetch" },
  TodoWrite: { label: "ToDo", kind: "todoUpdate", indexed: true },
  TaskCreate: { label: "ToDo を追加", kind: "todoAdd", indexed: true },
  TaskUpdate: { label: "ToDo を更新", kind: "todoUpdate", indexed: true },
  TaskList: { label: "ToDo の一覧", kind: "todoCheck" },
  TaskGet: { label: "ToDo を確認", kind: "todoCheck" },
  TaskStop: { label: "作業を停止", kind: "stop" },
  TaskOutput: { label: "作業の出力", kind: "watch" },
  Monitor: { label: "監視", kind: "watch" },
  AskUserQuestion: { label: "質問", kind: "question" },
  Agent: { label: "サブエージェント", kind: "subagent", indexed: true },
  SendMessage: { label: "メッセージ", kind: "message", indexed: true },
  SubagentHandback: { label: "報告", kind: "other", indexed: true },
  ToolSearch: { label: "ツール検索", kind: "toolSearch" },
  Skill: { label: "スキル", kind: "skill" },
  ExitPlanMode: { label: "計画を提示", kind: "plan" },
  EnterPlanMode: { label: "計画モード", kind: "other" },
  EnterWorktree: { label: "ワークツリーに入る", kind: "other" },
  ExitWorktree: { label: "ワークツリーを出る", kind: "other" },
};

/** 表の行（表にないツールは null） */
const specOf = (name: string): ClaudeToolSpec | null => (Object.hasOwn(CLAUDE_CODE_TOOLS, name) ? CLAUDE_CODE_TOOLS[name] : null);

/** 守りが読む欄（守りの表にないツールは null） */
export function claudeToolOf(name: string): GuardSpec | null {
  return specOf(name)?.guard ?? null;
}

/** ツールの種類（Claude Code のツールでなければ null） */
export const toolKindOf = (name: string): ToolKind | null => specOf(name)?.kind ?? null;

/** ツールの表示名（Claude Code のツールでなければ null） */
export const claudeToolLabel = (name: string): string | null => specOf(name)?.label ?? null;

/** ファイルを変えるツールか（Edit・MultiEdit・Write・NotebookEdit） */
export const isEditTool = (name: string): boolean => toolKindOf(name) === "edit";

/** サブエージェントを起動するツールか */
export const isSubagentTool = (name: string): boolean => toolKindOf(name) === "subagent";

/** サブエージェントを起動するツールの名前（コアが記録を軽く読むときも、この名前の呼び出しは引数ごと読む） */
export const SUBAGENT_TOOL_NAMES: readonly string[] = Object.keys(CLAUDE_CODE_TOOLS).filter(isSubagentTool);

/** 記録の索引が呼び出しと結果を丸ごと入れる Claude Code のツール */
export const INDEXED_CLAUDE_TOOLS: readonly string[] = Object.keys(CLAUDE_CODE_TOOLS).filter((name) => CLAUDE_CODE_TOOLS[name].indexed);

/** 編集の 1 つ分（old_string を new_string に） */
export interface EditHunk {
  old_string: string;
  new_string: string;
}

/**
 * ツールごとの入力の形（画面のツールの表示と守りが読む欄だけ）。ほかの AI の写しが足す欄: Write の content・Edit の文は分かったときだけ、
 * MultiEdit の move_path（名前を変えた先）・deleted（ファイルを消した）
 */
export interface ClaudeToolInputs {
  Bash: { command: string };
  Read: { file_path: string };
  Write: { file_path: string; content?: string };
  Edit: { file_path: string; old_string?: string; new_string?: string };
  MultiEdit: { file_path: string; edits: EditHunk[]; move_path?: string; deleted?: true };
  Grep: { pattern: string; path?: string };
  WebSearch: { query: string };
  WebFetch: { url: string };
}
export type ClaudeToolName = keyof ClaudeToolInputs;
export type ClaudeToolInput<N extends ClaudeToolName> = ClaudeToolInputs[N];

const call = <N extends ClaudeToolName>(name: N, input: ClaudeToolInput<N>) => ({ name, input });

/** Claude Code のツールの呼び出しを作る（ほかの AI のツールの記録の写しは、名前と入力を手で組み立てずにこれを使う） */
export const toolUse = {
  bash: (command: string) => call("Bash", { command }),
  read: (file_path: string) => call("Read", { file_path }),
  write: (file_path: string, content?: string) => call("Write", content === undefined ? { file_path } : { file_path, content }),
  edit: (file_path: string, hunk?: EditHunk) => call("Edit", hunk ? { file_path, ...hunk } : { file_path }),
  multiEdit: (file_path: string, edits: EditHunk[], extra: Pick<ClaudeToolInput<"MultiEdit">, "move_path" | "deleted"> = {}) => call("MultiEdit", { file_path, edits, ...extra }),
  grep: (pattern: string, path?: string) => call("Grep", path ? { pattern, path } : { pattern }),
  webSearch: (query: string) => call("WebSearch", { query }),
  webFetch: (url: string) => call("WebFetch", { url }),
};
