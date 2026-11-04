// コマンド（Bash）の結果の読み取り（終了コード・色の制御文字・長い出力の切り詰め）

export interface BashResult {
  /** 出力（先頭の「Exit code n」と色の制御文字を除いたもの） */
  output: string;
  /** 終了コード（Claude Code は失敗したときだけ、結果の先頭に「Exit code n」を付ける） */
  exitCode?: number;
  failed: boolean;
}

// 色などの制御文字（ESC [ … 文字）
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;

/** ツールの結果の文から、出力と終了コードを取り出す */
export function parseBashResult(content: string, isError: boolean): BashResult {
  const text = content.replace(ANSI, "");
  const m = /^Exit code (\d+)\n?/.exec(text);
  const exitCode = m ? Number(m[1]) : undefined;
  const output = (m ? text.slice(m[0].length) : text).replace(/\s+$/, "");
  return { output, ...(exitCode !== undefined ? { exitCode } : {}), failed: isError || (exitCode !== undefined && exitCode !== 0) };
}

/** 先頭から max 行だけにする（hidden は隠した行の数） */
export function clipLines(text: string, max: number): { shown: string; hidden: number } {
  const lines = text.split("\n");
  if (lines.length <= max) return { shown: text, hidden: 0 };
  return { shown: lines.slice(0, max).join("\n"), hidden: lines.length - max };
}
