// ツールの結果を、色を付けて出すために読み分ける（読む・検索・コマンドの出力）。React に依存しない純粋な関数
import { languageOf } from "@/lib/languages";

/** 行番号付きの 1 行（読むの結果。番号のない行は no が null） */
export interface NumberedLine {
  no: number | null;
  text: string;
}

/** Read の結果の 1 行（Claude Code は「番号\t中身」。以前の版は「    番号→中身」） */
const NUMBERED_LINE = /^\s*(\d+)(?:\t|→)(.*)$/;

/**
 * 読む（Read）の結果を、行番号と中身に分ける。どの行も番号付きの形でなければ null（画像・知らせなど。そのまま出す）。
 * 末尾の空行（最後の改行のあとの空）は落とす
 */
export function parseNumberedLines(content: string): NumberedLine[] | null {
  const raw = content.replace(/\n$/, "").split("\n");
  const lines: NumberedLine[] = [];
  for (const line of raw) {
    const m = NUMBERED_LINE.exec(line);
    if (!m) return null;
    lines.push({ no: Number(m[1]), text: m[2] });
  }
  return lines.length > 0 ? lines : null;
}

/** 検索（Grep・Glob）の結果の 1 行 */
export type SearchLine =
  /** 見つかった行（output_mode が content のとき）。context は前後の文脈の行（-A / -B / -C） */
  | { kind: "match" | "context"; path: string | null; no: number | null; text: string }
  /** ファイルのパス（files_with_matches・Glob）。count は件数（output_mode が count のとき） */
  | { kind: "path"; path: string; count: number | null }
  /** そのほか（「Found 3 files」・文脈の区切りの「--」など） */
  | { kind: "note"; text: string };

/** 「パス:行:中身」（見つかった行）と「パス-行-中身」（文脈）。パスを付けない形（1 つのファイルを探したとき）は「行:中身」 */
const MATCH_WITH_PATH = /^(.+?):(\d+):(.*)$/;
const CONTEXT_WITH_PATH = /^(.+?)-(\d+)-(.*)$/;
const MATCH_NO_PATH = /^(\d+)([:-])(.*)$/;
const COUNT_LINE = /^(.+?):(\d+)$/;

/**
 * 検索の結果を 1 行ずつ読み分ける。mode は Grep の output_mode（Glob は "files_with_matches" と同じ形）。
 * content は「パス:行:中身」（-n なしなら「パス:中身」は読めないので note）、files_with_matches はパスの一覧、count は「パス:件数」
 */
export function parseSearchLines(content: string, mode: string | undefined): SearchLine[] {
  const lines = content.replace(/\n$/, "").split("\n");
  return lines.map((line): SearchLine => {
    if (line === "--" || line.trim() === "" || /^Found \d+ (files?|lines?|matches?)/.test(line) || /^No (files|matches) found/.test(line)) {
      return { kind: "note", text: line };
    }
    if (mode === "content") {
      const m = MATCH_WITH_PATH.exec(line);
      if (m && !/^\d+$/.test(m[1])) return { kind: "match", path: m[1], no: Number(m[2]), text: m[3] };
      const c = CONTEXT_WITH_PATH.exec(line);
      if (c && !/^\d+$/.test(c[1])) return { kind: "context", path: c[1], no: Number(c[2]), text: c[3] };
      const n = MATCH_NO_PATH.exec(line);
      if (n) return { kind: n[2] === ":" ? "match" : "context", path: null, no: Number(n[1]), text: n[3] };
      return { kind: "note", text: line };
    }
    if (mode === "count") {
      const m = COUNT_LINE.exec(line);
      return m ? { kind: "path", path: m[1], count: Number(m[2]) } : { kind: "note", text: line };
    }
    return { kind: "path", path: line, count: null };
  });
}

/** 続けて同じファイルの行（見つかった行・文脈）のまとまり（まとまりごとに、そのファイルの言語で色を付ける） */
export interface SearchRun {
  lang: string | undefined;
  lines: SearchLine[];
}

/** 検索の結果の行を、色を付ける単位（同じファイルの続いた行。パス・知らせの行は 1 行ずつ）に分ける。path は探した場所（行にパスがないときの言語） */
export function searchRuns(lines: SearchLine[], path: string | undefined): SearchRun[] {
  const runs: SearchRun[] = [];
  let key: string | null = null;
  for (const line of lines) {
    if (line.kind === "match" || line.kind === "context") {
      const file = line.path ?? path ?? "";
      const last = runs.at(-1);
      if (last && key === file) last.lines.push(line);
      else runs.push({ lang: languageOf(file), lines: [line] });
      key = file;
    } else {
      runs.push({ lang: undefined, lines: [line] });
      key = null;
    }
  }
  return runs;
}

/** 出力の言語の推し量りに使う、ファイルの中身をそのまま出すコマンド */
const PRINT_COMMANDS = new Set(["cat", "head", "tail", "bat", "less", "more"]);

/**
 * コマンドの出力に色を付ける言語を推し量る: JSON として読める → json、差分（git diff / show・「diff --git」で始まる）→ diff、
 * 1 つのファイルの中身を出すだけのコマンド（cat a.ts・head -50 a.ts・sed -n '1,20p' a.ts）→ そのファイルの言語、
 * ほかはログの形（日時・エラー・警告・文字列・数・パスなどに色を付ける）
 */
export function outputLanguage(command: string, output: string): string {
  const trimmed = output.trim();
  if (/^[{[]/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // JSON でなければ次へ
    }
  }
  if (/^\s*git\s+(diff|show)\b/.test(command) || /^\s*git\s+log\b.*\s(-p|--patch)\b/.test(command) || /^(diff --git |--- \S)/.test(trimmed)) return "diff";
  const file = printedFile(command);
  const lang = file ? languageOf(file) : undefined;
  return lang ?? "log";
}

/** ファイルの中身をそのまま出すだけのコマンドなら、そのファイルのパス（パイプ・つなぎ・リダイレクトがあれば読まない） */
function printedFile(command: string): string | undefined {
  const line = command.trim();
  if (/[|;&<>`$()\n]/.test(line)) return undefined;
  const words = line.match(/'[^']*'|"[^"]*"|\S+/g) ?? [];
  const [name, ...args] = words;
  const isSed = name === "sed" && args[0] === "-n";
  if (!name || (!PRINT_COMMANDS.has(name) && !isSed)) return undefined;
  const files = args.filter((a) => !a.startsWith("-") && !/^\d+$/.test(a));
  // sed は最初の引数がスクリプト
  const targets = isSed ? files.slice(1) : files;
  if (targets.length !== 1) return undefined;
  return targets[0].replace(/^(['"])(.*)\1$/, "$2");
}
