// シェルのコマンド・スクリプトの heredoc（`python3 - <<'EOF'` … `EOF`）を見つけ、本文の言語を推し量る。
// シェルの文法の色付け（Shiki の shellscript）は本文をすべて文字列の色 1 色にするので、言語の分かる本文だけ、その言語で色を付け直す（lib/highlight）
import { languageOf } from "./languages";

/** heredoc の本文（行の番号の範囲 [start, end)。end は終わりの区切りの行） */
export interface Heredoc {
  start: number;
  end: number;
  /** 本文の言語（lib/highlight の言語の名前。分からなければ undefined） */
  lang: string | undefined;
}

/** 1 行の中の heredoc の始まり */
interface Marker {
  /** 区切りの名前（引用符・\ を除いたもの） */
  delimiter: string;
  /** `<<-`（終わりの区切りの行の先頭のタブを許す） */
  stripTabs: boolean;
  /** 同じコマンドの文（`<<` と区切りの名前を除く。言語を推し量るのに使う） */
  command: string;
}

type Quote = "'" | '"' | null;

/** 本文をコードとして読んで動かすコマンド → 言語（heredoc は、実行するファイルを渡していないときだけコード） */
const SCRIPT_RUNNERS: [RegExp, string][] = [
  [/^python[\d.]*$/, "python"],
  [/^(node|bun)$/, "javascript"],
  [/^(tsx|ts-node)$/, "typescript"],
  [/^(ruby|irb)$/, "ruby"],
  [/^(bash|sh|zsh|dash|ksh)$/, "shellscript"],
  [/^php$/, "php"],
];
/** 本文がいつも SQL のコマンド（データベースのファイルを渡しても、heredoc は SQL の文） */
const SQL_CLIENTS = /^(sqlite3|psql|mysql|duckdb)$/;
/** これがあれば、コードは引数から読み、heredoc は入力のデータ（python3 -c …・node -e … など） */
const CODE_FROM_ARGS = new Set(["-c", "-e", "-m", "-p", "--eval", "--print"]);
/** 区切りの名前 → 言語（`<<'SQL'` など。コマンドから決まらないとき） */
const DELIMITERS: Record<string, string> = {
  PY: "python",
  PYTHON: "python",
  JS: "javascript",
  JAVASCRIPT: "javascript",
  NODE: "javascript",
  TS: "typescript",
  TYPESCRIPT: "typescript",
  SQL: "sql",
  JSON: "json",
  YAML: "yaml",
  YML: "yaml",
  TOML: "toml",
  HTML: "html",
  CSS: "css",
  XML: "xml",
  SH: "shellscript",
  BASH: "shellscript",
  SHELL: "shellscript",
  ZSH: "shellscript",
  MD: "markdown",
  MARKDOWN: "markdown",
  RUBY: "ruby",
  RB: "ruby",
};
/** 前に付けて、後ろのコマンドを動かすだけのもの（`sudo python3` など）。2 語のもの（`uv run`）は WRAPPER_PAIRS */
const WRAPPERS = new Set(["sudo", "env", "time", "exec", "command", "nohup", "nice", "npx", "bunx", "uvx"]);
const WRAPPER_PAIRS = new Set(["uv run", "poetry run", "pipenv run", "pnpm exec", "pnpm dlx"]);

/**
 * 行に分けたシェルのコードから heredoc の本文を探す（引用符の中・コメントの `<<`、`<<<` は除く）。
 * 終わりの区切りの行がないものは、見間違い（文字列の中の `<<` など）かもしれないので本文として扱わない
 */
export function findHeredocs(lines: readonly string[]): Heredoc[] {
  const found: Heredoc[] = [];
  let quote: Quote = null;
  for (let i = 0; i < lines.length; ) {
    const scan = scanLine(lines[i], quote);
    quote = scan.quote;
    i++;
    // 1 行に 2 つあれば、本文はその順に続く
    for (const marker of scan.markers) {
      let end = i;
      while (end < lines.length && !closes(lines[end], marker)) end++;
      if (end === lines.length) continue;
      found.push({ start: i, end, lang: languageFor(marker) });
      i = end + 1;
    }
  }
  return found;
}

const closes = (line: string, { delimiter, stripTabs }: Marker) => (stripTabs ? line.replace(/^\t+/, "") : line) === delimiter;

/** 1 行を読み、heredoc の始まりと、行の終わりで引用符の中にいるか（複数行の文字列）を返す */
function scanLine(line: string, startQuote: Quote): { markers: Marker[]; quote: Quote } {
  const found: { delimiter: string; stripTabs: boolean; start: number; end: number }[] = [];
  // コマンドの区切り（; | & ( )）の位置。heredoc を含むコマンドの文を切り出すのに使う
  const separators: number[] = [];
  let quote = startQuote;
  let lineEnd = line.length;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === "\\" && quote === '"') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "\\") {
      i++;
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
      lineEnd = i;
      break;
    } else if (isSeparator(line, i)) {
      separators.push(i);
    } else if (c === "<" && line[i + 1] === "<" && line[i + 2] !== "<" && line[i - 1] !== "<") {
      const marker = readMarker(line, i);
      if (marker) {
        found.push(marker);
        i = marker.end - 1;
      }
    }
  }
  const markers = found.map(({ delimiter, stripTabs, start, end }) => {
    const from = Math.max(-1, ...separators.filter((s) => s < start)) + 1;
    const to = Math.min(lineEnd, ...separators.filter((s) => s >= end));
    return { delimiter, stripTabs, command: `${line.slice(from, start)} ${line.slice(end, to)}` };
  });
  return { markers, quote };
}

/** コマンドの区切りか（; | & ( )。書き出しの `>|`・`>&2`・`2>&1`・`&>` の | と & は除く） */
function isSeparator(line: string, i: number): boolean {
  const c = line[i];
  if (c === ";" || c === "(" || c === ")") return true;
  if (c === "|") return line[i - 1] !== ">";
  return c === "&" && line[i - 1] !== ">" && line[i - 1] !== "<" && line[i + 1] !== ">";
}

/** `<<` の位置から区切りの名前を読む（`<<EOF`・`<<-EOF`・`<< 'EOF'`・`<<"EOF"`・`<<\EOF`）。名前が数字で始まるもの（`1 << 2`）は heredoc ではない */
function readMarker(line: string, at: number) {
  let j = at + 2;
  const stripTabs = line[j] === "-";
  if (stripTabs) j++;
  while (line[j] === " " || line[j] === "\t") j++;
  const m = /^(?:'([^']+)'|"([^"]+)"|\\?([^\s;&|<>()'"]+))/.exec(line.slice(j));
  const delimiter = m && (m[1] ?? m[2] ?? m[3]);
  if (!m || !delimiter || /^\d/.test(delimiter)) return null;
  return { delimiter, stripTabs, start: at, end: j + m[0].length };
}

/** 本文の言語: コマンド（ファイルへの書き出し・実行するコマンド）から、決まらなければ区切りの名前から */
function languageFor({ command, delimiter }: Marker): string | undefined {
  const [name, ...args] = commandWords(command);
  return (name === undefined ? undefined : languageOfCommand(name, args)) ?? DELIMITERS[delimiter.toUpperCase()];
}

/** コマンドの語（前の環境変数 FOO=1 と、sudo・uv run などを除く。コマンド名はパスを除いた名前） */
function commandWords(command: string): string[] {
  const words = command
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/^['"]|['"]$/g, ""));
  let k = 0;
  while (k < words.length) {
    if (/^[A-Za-z_]\w*=/.test(words[k]) || WRAPPERS.has(words[k])) k++;
    else if (WRAPPER_PAIRS.has(`${words[k]} ${words[k + 1]}`)) k += 2;
    else break;
  }
  const [first, ...rest] = words.slice(k);
  return first === undefined ? [] : [first.slice(first.lastIndexOf("/") + 1), ...rest];
}

function languageOfCommand(name: string, args: string[]): string | undefined {
  // ファイルに書き出す（cat > a.ts <<EOF・cat <<EOF >| a.ts・tee a.json <<EOF）: 書き出すファイルの種類
  if (name === "cat") {
    const target = stdoutTarget(args);
    return target ? languageOf(target) : undefined;
  }
  if (name === "tee") {
    const target = args.find((a) => !a.startsWith("-"));
    return target ? languageOf(target) : undefined;
  }
  if (SQL_CLIENTS.test(name)) return "sql";
  const runner = SCRIPT_RUNNERS.find(([pattern]) => pattern.test(name));
  return runner && readsCodeFromStdin(args) ? runner[1] : undefined;
}

/** 標準出力の書き出し先（`> a.ts`・`>| a.ts`・`>> a.ts`・`>a.ts`。`2>`・`>&2` は除く） */
function stdoutTarget(args: string[]): string | undefined {
  for (let n = 0; n < args.length; n++) {
    const m = /^1?>[>|]?(.*)$/.exec(args[n]);
    if (!m) continue;
    const target = m[1] || args[n + 1];
    if (target && !target.startsWith("&")) return target;
  }
  return undefined;
}

/** 実行するファイルを渡さず、コードを標準入力（heredoc）から読むか（`python3 -`・`node --input-type=module`・`bash -s` など） */
function readsCodeFromStdin(args: string[]): boolean {
  for (const arg of args) {
    if (arg === "-" || arg === "-s") return true;
    if (CODE_FROM_ARGS.has(arg) || !arg.startsWith("-")) return false;
  }
  return true;
}
