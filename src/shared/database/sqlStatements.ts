import type { DbEngine } from "../types/database";

// SQL の文の分け方と、読むだけの文かの判定（SQL のタブの ⌘↵ / ⇧⌘↵ と、読み取り専用の接続の 1 段目の守り）。
// 文字列・識別子・コメントの中の ; や語は数えない。MySQL の DELIMITER（手続きを作るときの区切りの付け替え）は扱わない

/** 文の 1 つ（start / end は元の SQL の中の位置。text は前後の空白を除いたもの） */
export interface SqlStatement {
  text: string;
  start: number;
  end: number;
}

/** 字句の 1 つ（語・記号。文字列・識別子・コメントは種類だけ持つ） */
interface Token {
  kind: "word" | "string" | "ident" | "comment" | "symbol";
  text: string;
  start: number;
  end: number;
}

/** SQL を字句に分ける（空白は捨てる） */
function tokenize(sql: string, engine: DbEngine): Token[] {
  const tokens: Token[] = [];
  const mysql = engine === "mysql";
  let i = 0;
  const n = sql.length;
  // 閉じる印まで進める（backslash: \ の次の文字を飛ばす。doubled: 同じ印 2 つは中身）
  const until = (close: string, from: number, backslash: boolean) => {
    let j = from;
    while (j < n) {
      if (backslash && sql[j] === "\\") j += 2;
      else if (sql.startsWith(close, j)) {
        if (close.length === 1 && sql[j + 1] === close) j += 2;
        else return j + close.length;
      } else j++;
    }
    return n;
  };
  while (i < n) {
    const c = sql[i];
    const start = i;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? n : nl;
      tokens.push({ kind: "comment", text: sql.slice(start, i), start, end: i });
    } else if (c === "#" && mysql) {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? n : nl;
      tokens.push({ kind: "comment", text: sql.slice(start, i), start, end: i });
    } else if (c === "/" && sql[i + 1] === "*") {
      const close = sql.indexOf("*/", i + 2);
      i = close === -1 ? n : close + 2;
      tokens.push({ kind: "comment", text: sql.slice(start, i), start, end: i });
    } else if (c === "'") {
      i = until("'", i + 1, mysql);
      tokens.push({ kind: "string", text: sql.slice(start, i), start, end: i });
    } else if (c === '"') {
      i = until('"', i + 1, mysql);
      tokens.push({ kind: mysql ? "string" : "ident", text: sql.slice(start, i), start, end: i });
    } else if (c === "`") {
      i = until("`", i + 1, false);
      tokens.push({ kind: "ident", text: sql.slice(start, i), start, end: i });
    } else if (c === "[" && engine === "sqlite") {
      const close = sql.indexOf("]", i + 1);
      i = close === -1 ? n : close + 1;
      tokens.push({ kind: "ident", text: sql.slice(start, i), start, end: i });
    } else if (c === "$" && engine === "postgres" && /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.test(sql.slice(i, i + 64))) {
      // PostgreSQL のドル記号の文字列（$$ … $$ / $tag$ … $tag$。関数の中身）
      const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64))![0];
      const close = sql.indexOf(tag, i + tag.length);
      i = close === -1 ? n : close + tag.length;
      tokens.push({ kind: "string", text: sql.slice(start, i), start, end: i });
    } else if (/[A-Za-z_\u0080-￿]/.test(c)) {
      while (i < n && /[A-Za-z0-9_$\u0080-￿]/.test(sql[i])) i++;
      tokens.push({ kind: "word", text: sql.slice(start, i), start, end: i });
    } else {
      i++;
      tokens.push({ kind: "symbol", text: c, start, end: i });
    }
  }
  return tokens;
}

const upper = (t: Token) => (t.kind === "word" ? t.text.toUpperCase() : "");

/** 文の頭が CREATE … TRIGGER か（SQLite・MySQL のトリガーは BEGIN … END の中に ; がある） */
const isTriggerHead = (words: string[]) => words[0] === "CREATE" && words.slice(1, 5).includes("TRIGGER");
/** トリガーの中で END と組になる語（MySQL の IF … END IF など。IF( は関数なので数えない） */
const BLOCK_OPENERS = new Set(["BEGIN", "CASE", "IF", "LOOP", "WHILE", "REPEAT"]);

/** SQL を文に分ける（中身のない文（空白・コメントだけ）は除く） */
export function splitStatements(sql: string, engine: DbEngine): SqlStatement[] {
  const tokens = tokenize(sql, engine);
  const out: SqlStatement[] = [];
  let current: Token[] = [];
  let depth = 0;
  const flush = (end: number) => {
    const meaningful = current.filter((t) => t.kind !== "comment");
    if (meaningful.length > 0) {
      const start = current[0].start;
      const raw = sql.slice(start, end);
      const trimmed = raw.trimEnd();
      out.push({ text: trimmed, start, end: start + trimmed.length });
    }
    current = [];
    depth = 0;
  };
  let words: string[] = [];
  tokens.forEach((t, i) => {
    if (t.kind === "symbol" && t.text === ";" && depth === 0) {
      flush(t.start);
      words = [];
      return;
    }
    current.push(t);
    if (engine === "postgres" || t.kind !== "word") return;
    const w = upper(t);
    const prev = words.at(-1);
    words.push(w);
    if (!isTriggerHead(words)) return;
    if (w === "END") {
      if (depth > 0) depth--;
    } else if (BLOCK_OPENERS.has(w) && prev !== "END" && (w === "BEGIN" || depth > 0) && tokens[i + 1]?.text !== "(") depth++;
  });
  if (current.length > 0) flush(current[current.length - 1].end);
  return out;
}

/**
 * カーソルのある文（⌘↵）。カーソルが文と文の間（空白・;）なら直前の文、最初の文より前なら最初の文。文がなければ null
 */
export function statementAt(statements: SqlStatement[], offset: number): SqlStatement | null {
  if (statements.length === 0) return null;
  let found: SqlStatement | null = null;
  for (const s of statements) {
    if (s.start <= offset) found = s;
    else break;
  }
  return found ?? statements[0];
}

/** 読むだけの SQLite の PRAGMA（引数を取って中を見るもの） */
const READ_PRAGMAS = new Set([
  "TABLE_INFO",
  "TABLE_XINFO",
  "TABLE_LIST",
  "INDEX_LIST",
  "INDEX_INFO",
  "INDEX_XINFO",
  "FOREIGN_KEY_LIST",
  "FOREIGN_KEY_CHECK",
  "DATABASE_LIST",
  "COLLATION_LIST",
  "COMPILE_OPTIONS",
  "FUNCTION_LIST",
  "MODULE_LIST",
  "PRAGMA_LIST",
  "INTEGRITY_CHECK",
  "QUICK_CHECK",
]);
/** 引数がなくても何かを変える PRAGMA */
const ACTING_PRAGMAS = new Set(["OPTIMIZE", "SHRINK_MEMORY", "WAL_CHECKPOINT", "INCREMENTAL_VACUUM"]);
/** 書く文の頭の語（WITH の中・EXPLAIN ANALYZE の後ろで探す） */
const WRITE_WORDS = new Set(["INSERT", "UPDATE", "DELETE", "MERGE", "REPLACE", "UPSERT", "CREATE", "DROP", "ALTER", "TRUNCATE", "GRANT", "REVOKE", "COPY", "CALL", "DO"]);

/**
 * 読むだけの文か（読み取り専用の接続で、流す前に断る 1 段目。DB 側の読み取り専用と合わせて守る）。
 * SELECT（INTO・ロックを除く）・WITH（中に書く文がない）・EXPLAIN（ANALYZE は後ろも読むだけのとき）・SHOW・DESCRIBE・VALUES・TABLE・
 * トランザクションの始め / 終わり（READ WRITE を除く）・SQLite の読むだけの PRAGMA。分からないものは書く文とみなす
 */
export function isReadOnlyStatement(text: string, engine: DbEngine): boolean {
  const tokens = tokenize(text, engine).filter((t) => t.kind !== "comment");
  const words = tokens.filter((t) => t.kind === "word").map(upper);
  // 頭の ( は飛ばす（(SELECT …) UNION …）
  const head = words[0];
  if (!head) return true;
  const has = (w: string) => words.includes(w);
  const hasWrite = () => words.some((w) => WRITE_WORDS.has(w));
  switch (head) {
    case "SELECT":
      return !has("INTO") && !(has("FOR") && (has("UPDATE") || has("SHARE")));
    case "WITH":
      return !hasWrite() && !has("INTO");
    case "EXPLAIN":
      return has("ANALYZE") || has("ANALYSE") ? !hasWrite() && !has("INTO") : true;
    case "SHOW":
    case "DESCRIBE":
    case "DESC":
    case "VALUES":
    case "TABLE":
      return true;
    case "BEGIN":
    case "START":
    case "COMMIT":
    case "ROLLBACK":
    case "END":
    case "SAVEPOINT":
    case "RELEASE":
      return !has("WRITE");
    case "PRAGMA": {
      if (engine !== "sqlite") return false;
      // PRAGMA [schema.]name … の name
      const name = tokens[2]?.text === "." ? upper(tokens[3] ?? tokens[1]) : upper(tokens[1]);
      if (tokens.some((t) => t.kind === "symbol" && t.text === "=")) return false;
      if (READ_PRAGMAS.has(name)) return true;
      const hasArgs = tokens.some((t) => t.kind === "symbol" && t.text === "(");
      return !hasArgs && !ACTING_PRAGMAS.has(name);
    }
    default:
      return false;
  }
}
