// 返答の一部を選んでコメントするときの、チャット欄に添える文（純粋関数）

/** 引用する文の長さの上限（長すぎる選択は頭だけにする） */
const MAX_QUOTE = 1500;

/**
 * 選んだ文を Markdown の引用にし、コメントを添える（「> 選んだ文」の下にコメント）。
 * 行頭・行末の空白と、続く空行は詰める。コメントが空なら引用だけ
 */
export function quoteComment(selection: string, comment: string): string {
  let text = selection.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length > MAX_QUOTE) text = `${text.slice(0, MAX_QUOTE)}…`;
  const quote = text
    .split("\n")
    .map((line) => (line.trim() ? `> ${line.trim()}` : ">"))
    .join("\n");
  const note = comment.trim();
  return note ? `${quote}\n\n${note}` : quote;
}

/** チャット欄の文の後ろに足す（書いている文があれば空行を挟む） */
export function appendBlock(current: string, block: string): string {
  const head = current.replace(/\s+$/, "");
  return head ? `${head}\n\n${block}` : block;
}

/**
 * 差分・ファイルの中身の行を選んで足すときの、チャット欄に添える文: 「`パス` の 12〜15 行目（変更後）:」（ファイルの中身は側を付けない）の下にコードのブロック、その下にコメント。
 * コードに ``` があれば、それより長い囲みにする。長すぎる選択は頭だけにする。コメントが空なら引用だけ
 */
export function quoteCode({ path, from, to, side, code, comment }: { path: string; from: number; to: number; side: "new" | "old" | null; code: string; comment: string }): string {
  let text = code.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").replace(/^\n+|\n+$/g, "");
  if (text.length > MAX_QUOTE) text = `${text.slice(0, MAX_QUOTE)}…`;
  const fence = "`".repeat(Math.max(3, ...[...text.matchAll(/`{3,}/g)].map((m) => m[0].length + 1)));
  const lines = from === to ? `${from} 行目` : `${from}〜${to} 行目`;
  const head = `\`${path}\` の ${lines}${side === null ? "" : side === "new" ? "（変更後）" : "（変更前）"}:`;
  const block = `${head}\n${fence}\n${text}\n${fence}`;
  const note = comment.trim();
  return note ? `${block}\n\n${note}` : block;
}
