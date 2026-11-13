// チャットの AI が内蔵ターミナルの出力を読むツール（kickoff_chat の list_terminals・read_terminal）の、コアと画面で共有する名前・引数・上限と、記録の行に出す文

/** このプロジェクトのターミナルのタブの一覧を返すツールの名前 */
export const AI_LIST_TERMINALS_TOOL = "mcp__kickoff_chat__list_terminals";

/** ターミナルのタブの最後の出力を読むツールの名前 */
export const AI_READ_TERMINAL_TOOL = "mcp__kickoff_chat__read_terminal";

/** read_terminal で、lines を省いたときに読む行の数（最後から） */
export const READ_TERMINAL_DEFAULT_LINES = 200;

/** read_terminal で、1 回に読める行の数の上限（裏の端末に残すのは 5000 行） */
export const READ_TERMINAL_MAX_LINES = 1000;

/** read_terminal の引数。terminal: list_terminals の id（タブが 1 つだけなら省ける）。lines: 最後から読む行の数 */
export interface ReadTerminalInput {
  terminal?: string;
  lines?: number;
}

/** 記録の行に出す文（「200 行」。行の数を省いたら空） */
export function describeReadTerminal(input: Record<string, unknown>): string {
  return typeof input.lines === "number" ? `最後の ${input.lines} 行` : "";
}
