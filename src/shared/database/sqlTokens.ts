// SQL の字句に分ける（文字列・識別子・コメントの中の ; や語を数えないため。文の分け方と読むだけの判定 sqlStatements.ts が使う）
import { DB_DIALECTS } from "./dialect";
import type { DbEngine } from "./types";

/** 字句の 1 つ（語・記号。文字列・識別子・コメントは種類だけ持つ） */
export interface Token {
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
export function tokenize(sql: string, engine: DbEngine): Token[] {
  const tokens: Token[] = [];
  const lex = DB_DIALECTS[engine].lexical;
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
    const execHead = lex.versionComment && !inExecComment ? /^\/\*M?!\d{0,6}/.exec(sql.slice(i, i + 10)) : null;
    if (execHead) {
      // 版の番号に関わらず、中身はいつも流れるものとして読む（守りの側に倒す）
      inExecComment = true;
      i += execHead[0].length;
      continue;
    }
    // MySQL の -- は後ろに空白（か終わり）があるときだけコメント（1--1 は引き算）
    if (c === "-" && sql[i + 1] === "-" && (!lex.dashNeedsSpace || i + 2 >= n || /\s/.test(sql[i + 2]))) {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? n : nl;
      tokens.push({ kind: "comment", text: sql.slice(start, i), start, end: i });
    } else if (c === "#" && lex.hashComment) {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? n : nl;
      tokens.push({ kind: "comment", text: sql.slice(start, i), start, end: i });
    } else if (c === "/" && sql[i + 1] === "*") {
      i = blockCommentEnd(sql, i, lex.nestedComments);
      tokens.push({ kind: "comment", text: sql.slice(start, i), start, end: i });
    } else if (c === "'") {
      // PostgreSQL の E'…'（\ でエスケープする文字列。E'\'' は ' 1 文字）。前の E の語は文字列に含める
      const prev = tokens.at(-1);
      const escaped = lex.escapeStrings && prev?.kind === "word" && prev.end === i && /^[eE]$/.test(prev.text);
      i = until("'", i + 1, lex.backslashInStrings || escaped);
      if (escaped) tokens.pop();
      const from = escaped ? start - 1 : start;
      tokens.push({ kind: "string", text: sql.slice(from, i), start: from, end: i });
    } else if (c === '"') {
      i = until('"', i + 1, lex.backslashInStrings);
      tokens.push({ kind: lex.doubleQuoteIsString ? "string" : "ident", text: sql.slice(start, i), start, end: i });
    } else if (c === "`") {
      i = until("`", i + 1, false);
      tokens.push({ kind: "ident", text: sql.slice(start, i), start, end: i });
    } else if (c === "[" && lex.bracketIdent) {
      const close = sql.indexOf("]", i + 1);
      i = close === -1 ? n : close + 1;
      tokens.push({ kind: "ident", text: sql.slice(start, i), start, end: i });
    } else if (c === "$" && lex.dollarQuote && /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.test(sql.slice(i, i + 64))) {
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

/** 語なら大文字にしたもの（語でなければ空） */
export const upper = (t: Token) => (t.kind === "word" ? t.text.toUpperCase() : "");
