// Bash の文をコマンドの並びに分ける（AI の守りが、Docker の操作・ファイルを消すコマンドを見つけるのに使う）。sh -c の中は scanCommands で下りる。
// うっかりを防ぐためのもので、eval・スクリプトのファイルなど、わざと避ける書き方までは見抜けない
import path from "node:path";

/** シェルの 1 語（$・`…` を含むものは中身が流すまで分からない） */
export interface Word {
  text: string;
  dynamic: boolean;
}

/** シェルの文を、&&・||・;・|・&・改行・括弧で区切ったコマンドの並びにする（引用・エスケープ・$(…)・リダイレクトを読む） */
export function splitCommands(src: string): Word[][] {
  const segments: Word[][] = [];
  let words: Word[] = [];
  let cur = "";
  let dynamic = false;
  let inWord = false;
  const pushWord = () => {
    if (inWord) words.push({ text: cur, dynamic });
    cur = "";
    dynamic = false;
    inWord = false;
  };
  const endSegment = () => {
    pushWord();
    if (words.length) segments.push(words);
    words = [];
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "'") {
      const j = src.indexOf("'", i + 1);
      const end = j < 0 ? src.length : j;
      cur += src.slice(i + 1, end);
      inWord = true;
      i = end;
    } else if (ch === '"') {
      let j = i + 1;
      for (; j < src.length && src[j] !== '"'; j++) {
        if (src[j] === "\\" && j + 1 < src.length) {
          cur += src[++j];
          continue;
        }
        if (src[j] === "$" || src[j] === "`") dynamic = true;
        cur += src[j];
      }
      inWord = true;
      i = j;
    } else if (ch === "\\") {
      if (src[i + 1] !== "\n") {
        cur += src[i + 1] ?? "";
        inWord = true;
      }
      i++;
    } else if (ch === "$" && src[i + 1] === "(") {
      let depth = 0;
      let j = i + 1;
      for (; j < src.length; j++) {
        if (src[j] === "(") depth++;
        else if (src[j] === ")" && --depth === 0) break;
      }
      cur += src.slice(i, j + 1);
      dynamic = true;
      inWord = true;
      i = j;
    } else if (ch === "`") {
      const j = src.indexOf("`", i + 1);
      const end = j < 0 ? src.length : j;
      cur += src.slice(i, end + 1);
      dynamic = true;
      inWord = true;
      i = end;
    } else if (ch === "$") {
      cur += ch;
      dynamic = true;
      inWord = true;
    } else if (ch === "#" && !inWord) {
      const j = src.indexOf("\n", i);
      i = (j < 0 ? src.length : j) - 1;
    } else if (ch === ">" || ch === "<") {
      // リダイレクト（2>&1・> out.log・< in）は飛ばす（前の数字も先の 1 語も、コマンドの引数ではない）
      if (/^\d*$/.test(cur)) {
        cur = "";
        inWord = false;
      } else pushWord();
      let j = i + 1;
      while (j < src.length && /[><&|]/.test(src[j])) j++;
      while (j < src.length && src[j] === " ") j++;
      while (j < src.length && !/[\s;&|()]/.test(src[j])) j++;
      i = j - 1;
    } else if (ch === "\n" || ch === ";" || ch === "&" || ch === "|" || ch === "(" || ch === ")") {
      endSegment();
    } else if (/\s/.test(ch)) {
      pushWord();
    } else {
      cur += ch;
      inWord = true;
    }
  }
  endSegment();
  return segments;
}

/** コマンドの前に付けて、そのまま後ろのコマンドを流すもの（for・if・while の do / then の後ろも同じ） */
export const WRAPPERS = new Set(["sudo", "command", "nohup", "time", "exec", "env", "nice", "do", "then", "else", "if", "while", "until", "!", "{"]);
export const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** 行頭の VAR=値・前に付けるもの（sudo・env など）を外した、流すコマンドの語（env は VAR=値 で決めた環境変数） */
export function commandWords(segment: Word[]): { words: Word[]; env: Record<string, string> } {
  let words = segment;
  const env: Record<string, string> = {};
  for (;;) {
    const w = words[0];
    if (!w) break;
    if (ASSIGNMENT.test(w.text)) {
      if (!w.dynamic) env[w.text.slice(0, w.text.indexOf("="))] = w.text.slice(w.text.indexOf("=") + 1);
      words = words.slice(1);
    } else if (WRAPPERS.has(w.text)) words = words.slice(1);
    else break;
  }
  return { words, env };
}

/** git のサブコマンドより前の、値を取るオプション */
const GIT_GLOBAL_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--config-env"]);

/** git のコマンドの語（commandWords のあと）を、サブコマンドより前のオプション・サブコマンド・その後ろに分ける（git でなければ null） */
export function gitParts(words: Word[]): { globals: Word[]; sub: string | undefined; args: Word[] } | null {
  if (!words[0] || path.basename(words[0].text) !== "git") return null;
  let i = 1;
  while (i < words.length && words[i].text.startsWith("-")) i += GIT_GLOBAL_WITH_VALUE.has(words[i].text) ? 2 : 1;
  return { globals: words.slice(1, i), sub: words[i]?.text, args: words.slice(i + 1) };
}

/** 文字列をシェルの文として流すもの */
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);

/** sh -c '…' / bash -c "…" の中の文（シェルでない・-c がなければ null） */
export function shellScriptOf(words: Word[]): string | null {
  if (!words[0] || !SHELLS.has(path.basename(words[0].text))) return null;
  const at = words.findIndex((w) => w.text === "-c" || /^-[a-z]*c$/.test(w.text));
  return at > 0 ? (words[at + 1]?.text ?? null) : null;
}

/**
 * 文の各コマンド（splitCommands の 1 つずつ）に visit を当て、最初に返った値（null・undefined でないもの）を返す。
 * sh -c '…' / bash -c "…" の中の文にも depth 段まで下りる（見つからなければ null）
 */
export function scanCommands<T>(command: string, visit: (segment: Word[]) => T | null | undefined, depth = 3): T | null {
  for (const segment of splitCommands(command)) {
    const found = visit(segment);
    if (found !== null && found !== undefined) return found;
    const script = depth > 0 ? shellScriptOf(commandWords(segment).words) : null;
    const inner = script === null ? null : scanCommands(script, visit, depth - 1);
    if (inner !== null) return inner;
  }
  return null;
}
