/** 内蔵ターミナルで動かすシェル（macOS は macosShell.ts） */
export interface TerminalShell {
  /** 実行ファイル */
  file: string;
  /** 引数（command があれば、そのコマンドだけを流す。なければ対話のシェル） */
  args: (command: string | null) => string[];
}
