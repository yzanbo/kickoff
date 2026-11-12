// ターミナルで選んだ文を「チャットに追加」するときの形（純粋関数）。短い選択は入力欄に文で入れ、長い選択は札にする（仕様書「添付の共通化」の段階 2）

/** これを超える行数・文字数の選択は札にする（入力欄をログで埋めない。短い引用はその場で直せる） */
export const LONG_SELECTION_LINES = 30;
export const LONG_SELECTION_CHARS = 3000;

/** 選んだ文を整える（改行をそろえ、行末の空白と、頭と終わりの空行を落とす。ターミナルは行末を空白で埋めて写すため） */
export function cleanSelection(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/^\n+|\n+$/g, "");
}

/** 行数 */
export const lineCount = (text: string): number => (text === "" ? 0 : text.split("\n").length);

/** 札にする長さか（整えたあとの文で数える） */
export function isLongSelection(text: string): boolean {
  return lineCount(text) > LONG_SELECTION_LINES || text.length > LONG_SELECTION_CHARS;
}

/** 短い選択の入力欄に入れる文（見出しの下にコードのブロック。中に ``` があれば、それより長い囲みにする） */
export function terminalQuote(text: string): string {
  const fence = "`".repeat(Math.max(3, ...[...text.matchAll(/`{3,}/g)].map((m) => m[0].length + 1)));
  return `ターミナルの出力:\n${fence}\n${text}\n${fence}`;
}

/** 長い選択の札の名前（「kickoff・120 行」。フォルダはシェルを始めたフォルダの名前） */
export function terminalCaptureLabel(cwd: string, text: string): string {
  const folder = cwd.replace(/\/+$/, "").split("/").pop() || cwd;
  return `${folder}・${lineCount(text)} 行`;
}
