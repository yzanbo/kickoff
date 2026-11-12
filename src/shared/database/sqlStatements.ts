import type { DbEngine, DbWriteCheck } from "../types/database";

// SQL の文の分け方と、読むだけの文かの判定（SQL のタブの ⌘↵ / ⇧⌘↵ と、読み取り専用の接続の 1 段目の守り）。
// 文字列・識別子・コメントの中の ; や語は数えない。MySQL の DELIMITER（手続きを作るときの区切りの付け替え）は扱わない。
// MySQL の /*! … * /（版つきの実行されるコメント。MariaDB の /*M! … * / も）は中身を文として読む（コメントとして捨てると、中の INTO OUTFILE・DROP などが守りを素通りする）

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

/** 囲むコメント（/* から * / まで）の終わりの次の位置（nested: PostgreSQL は入れ子にできる。閉じていなければ終わりまで） */
function blockCommentEnd(sql: string, from: number, nested: boolean): number {
  let depth = 0;
  let j = from;
  while (j < sql.length) {
    if (sql.startsWith("/*", j)) {
      if (depth > 0 && !nested) {
        j += 2;
        continue;
      }
      depth++;
      j += 2;
    } else if (sql.startsWith("*/", j)) {
      depth--;
      j += 2;
      if (depth === 0) return j;
    } else j++;
  }
  return sql.length;
}

/** SQL を字句に分ける（空白は捨てる） */
function tokenize(sql: string, engine: DbEngine): Token[] {
  const tokens: Token[] = [];
  const mysql = engine === "mysql";
  let i = 0;
  const n = sql.length;
  // MySQL の /*! … * / の中か（閉じる印は飛ばす）
  let inExecComment = false;
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
    if (inExecComment && c === "*" && sql[i + 1] === "/") {
      inExecComment = false;
      i += 2;
      continue;
    }
    const execHead = mysql && !inExecComment ? /^\/\*M?!\d{0,6}/.exec(sql.slice(i, i + 10)) : null;
    if (execHead) {
      // 版の番号に関わらず、中身はいつも流れるものとして読む（守りの側に倒す）
      inExecComment = true;
      i += execHead[0].length;
      continue;
    }
    // MySQL の -- は後ろに空白（か終わり）があるときだけコメント（1--1 は引き算）
    if (c === "-" && sql[i + 1] === "-" && (!mysql || i + 2 >= n || /\s/.test(sql[i + 2]))) {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? n : nl;
      tokens.push({ kind: "comment", text: sql.slice(start, i), start, end: i });
    } else if (c === "#" && mysql) {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? n : nl;
      tokens.push({ kind: "comment", text: sql.slice(start, i), start, end: i });
    } else if (c === "/" && sql[i + 1] === "*") {
      i = blockCommentEnd(sql, i, engine === "postgres");
      tokens.push({ kind: "comment", text: sql.slice(start, i), start, end: i });
    } else if (c === "'") {
      // PostgreSQL の E'…'（\ でエスケープする文字列。E'\'' は ' 1 文字）。前の E の語は文字列に含める
      const prev = tokens.at(-1);
      const escaped = engine === "postgres" && prev?.kind === "word" && prev.end === i && /^[eE]$/.test(prev.text);
      i = until("'", i + 1, mysql || escaped);
      if (escaped) tokens.pop();
      const from = escaped ? start - 1 : start;
      tokens.push({ kind: "string", text: sql.slice(from, i), start: from, end: i });
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

/** 危険な文でなく、確かめずに流してよい書く文の頭の語（「危険な文だけ確かめる」の接続で。ここにない語は判定できない文として確かめる） */
const PLAIN_WRITE_WORDS = new Set(["INSERT", "UPDATE", "DELETE", "CREATE", "REPLACE", "UPSERT", "SET", "USE", "ANALYZE", "COMMENT"]);
/** いつも危険な文の頭の語と、その理由 */
const DANGER_WORDS: Record<string, string> = {
  DROP: "DROP（消す）",
  TRUNCATE: "TRUNCATE（中身をすべて消す）",
  ALTER: "ALTER（テーブルなどの形を変える）",
};

/**
 * 危険な文ならその理由（書き込む前の確かめの「危険な文だけ確かめる」。読むだけの文・ふつうの書く文なら null）。
 * 危険な文 = DROP・TRUNCATE・ALTER・WHERE のない UPDATE / DELETE（括弧の外に WHERE がない。WITH の中・EXPLAIN ANALYZE の後ろも見る）・判定できない文
 */
export function dangerReason(text: string, engine: DbEngine): string | null {
  if (isReadOnlyStatement(text, engine)) return null;
  const tokens = tokenize(text, engine).filter((t) => t.kind !== "comment");
  // 括弧の深さごとの語（WHERE は文の外側の段で探す）
  let depth = 0;
  const words: { word: string; depth: number }[] = [];
  for (const t of tokens) {
    if (t.kind === "symbol" && t.text === "(") depth++;
    else if (t.kind === "symbol" && t.text === ")") depth = Math.max(0, depth - 1);
    else if (t.kind === "word") words.push({ word: upper(t), depth });
  }
  const head = words[0]?.word;
  if (!head) return null;
  // WITH … / EXPLAIN ANALYZE … は、中の最初の書く文で決める
  const verbAt = head === "WITH" || head === "EXPLAIN" ? words.findIndex((w) => WRITE_WORDS.has(w.word)) : 0;
  const verb = verbAt >= 0 ? words[verbAt] : undefined;
  if (!verb) return `判定できない文（${head}）`;
  if (DANGER_WORDS[verb.word]) return DANGER_WORDS[verb.word];
  if (verb.word === "UPDATE" || verb.word === "DELETE") {
    const where = words.slice(verbAt + 1).some((w) => w.word === "WHERE" && w.depth === verb.depth);
    return where ? null : verb.word === "UPDATE" ? "WHERE のない UPDATE（すべての行を書き換える）" : "WHERE のない DELETE（すべての行を消す）";
  }
  return PLAIN_WRITE_WORDS.has(verb.word) ? null : `判定できない文（${verb.word}）`;
}

/** 流す前の確かめの要り方（none = 確かめない / confirm = SQL を見せて確かめる / env_name = 環境の名前を打たせる）と、危険な文の理由 */
export interface WriteConfirmation {
  kind: "none" | "confirm" | "env_name";
  /** 危険な文ごとの番号（1 から）と理由 */
  dangers: { index: number; reason: string }[];
}

/**
 * 読み取り専用でない接続で、流す文に要る確かめ（純粋な関数）。読むだけの文ばかりなら確かめない。
 * dangerous = 危険な文があるときだけ確かめる / all = 書く文があれば確かめる / env_name = 書く文があれば環境の名前を打たせる
 */
export function writeConfirmation(check: DbWriteCheck, texts: string[], engine: DbEngine): WriteConfirmation {
  const dangers = texts.flatMap((text, i) => {
    const reason = dangerReason(text, engine);
    return reason ? [{ index: i + 1, reason }] : [];
  });
  const writes = texts.some((text) => !isReadOnlyStatement(text, engine));
  if (!writes) return { kind: "none", dangers };
  if (check === "env_name") return { kind: "env_name", dangers };
  if (check === "all" || dangers.length > 0) return { kind: "confirm", dangers };
  return { kind: "none", dangers };
}
