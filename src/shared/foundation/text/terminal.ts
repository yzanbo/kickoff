// 端末向けの出力の掃除（AI の CLI の実行中のコマンドの出力などを、画面に出す文にする）

/**
 * 端末向けの出力を、画面に出す文にする: 色などの制御文字を除き、\r で上書きした行（進み具合の表示）は最後の状態だけにする
 */
export function cleanTerminalText(raw: string): string {
  const stripped = raw
    // OSC（題名・リンクなど）・CSI（色・カーソル）・そのほかの ESC の並び
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[@-Z\\-_]/g, "")
    .replace(/\r\n/g, "\n");
  return stripped
    .split("\n")
    .map((line) => {
      if (!line.includes("\r")) return line;
      // 上書きした行は、空でない最後の状態（行の終わりの \r だけなら、その前の状態）
      const parts = line.split("\r").filter((p) => p !== "");
      return parts.at(-1) ?? "";
    })
    .join("\n")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
}

/** 最後の n 行（終わりの改行は数えない） */
export function tailLines(text: string, n: number): string {
  return text.replace(/\n+$/, "").split("\n").slice(-n).join("\n");
}
