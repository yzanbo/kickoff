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
