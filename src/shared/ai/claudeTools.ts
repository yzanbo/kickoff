// Claude Code のツールの語彙（守りが読む欄だけの最小の表。ほかの AI のツールの記録もこの名前と入力の形にそろえる）

interface ClaudeToolSpec {
  /** 入力のパスの欄（パスを取らないツールは null） */
  pathKey: string | null;
  /** ファイルを書き換えるか */
  writes: boolean;
  /** パスが探す場所か（Glob・Grep。ファイルを開かない） */
  searches: boolean;
}

const CLAUDE_TOOLS = {
  Bash: { pathKey: null, writes: false, searches: false },
  Read: { pathKey: "file_path", writes: false, searches: false },
  Write: { pathKey: "file_path", writes: true, searches: false },
  Edit: { pathKey: "file_path", writes: true, searches: false },
  MultiEdit: { pathKey: "file_path", writes: true, searches: false },
  NotebookEdit: { pathKey: "notebook_path", writes: true, searches: false },
  Glob: { pathKey: "path", writes: false, searches: true },
  Grep: { pathKey: "path", writes: false, searches: true },
} as const satisfies Record<string, ClaudeToolSpec>;

/** ツールの名前の表の行（表にないツールは null） */
export function claudeToolOf(name: string): ClaudeToolSpec | null {
  return Object.hasOwn(CLAUDE_TOOLS, name) ? CLAUDE_TOOLS[name as keyof typeof CLAUDE_TOOLS] : null;
}

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
