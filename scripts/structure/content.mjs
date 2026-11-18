// 構造の検査（scripts/check-structure.mjs）の種類のうち、ファイルの中身で見るもの: SQL の表の持ち主・CSS のクラスの持ち主・禁じる書き方。
// コードは構文木（oxc-parser）で読み、コメントを拾わない
import { Visitor } from "oxc-parser";
import { expandLayers, isCodeFile, matchesAny, parseCode } from "./parse.mjs";
import { skipsTest } from "./checks.mjs";

/**
 * SQL の表の名前の前に来る言葉。このリポジトリの SQL は大文字で書くので、言葉は大文字だけを見る
 * （ふつうの文の「from」を拾わないため）。表の名前は小文字にそろえて返す
 */
const SQL_TABLE = /\b(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM|TABLE(?:\s+IF(?:\s+NOT)?\s+EXISTS)?)\s+["`]?([a-zA-Z_][a-zA-Z0-9_]*)/g;
/** 言葉のあとに来ても表ではないもの（ON CONFLICT … DO UPDATE SET など） */
const SQL_WORDS = new Set(["set", "select", "values", "where"]);

/** コードの文字の値（文字のリテラルとテンプレート文字の各部分）から、SQL が読み書きする表の名前を拾う */
export function sqlTablesIn(file, source) {
  const texts = [];
  new Visitor({
    Literal(node) {
      if (typeof node.value === "string") texts.push(node.value);
    },
    TemplateElement(node) {
      if (node.value.cooked) texts.push(node.value.cooked);
    },
  }).visit(parseCode(file, source).program);
  const tables = new Set();
  for (const text of texts) {
    for (const m of text.matchAll(SQL_TABLE)) {
      const name = m[1].toLowerCase();
      if (!SQL_WORDS.has(name)) tables.add(name);
    }
  }
  return [...tables];
}

/** SQL の表の持ち主: owners にある表を、持ち主の glob の外のファイルが書いていないか（ignoreNames は表として扱わない） */
export function checkSqlTables(sources, config) {
  const rule = config.sqlTables ?? {};
  const owners = rule.owners ?? {};
  const ignore = new Set(rule.ignoreNames ?? []);
  const out = [];
  for (const [file, source] of sources) {
    if (!isCodeFile(file) || !matchesAny(file, rule.files ?? []) || skipsTest(file, rule, config)) continue;
    for (const table of sqlTablesIn(file, source)) {
      if (ignore.has(table) || !owners[table] || matchesAny(file, owners[table])) continue;
      out.push({ kind: "sql", key: `sql:${file}:${table}`, message: `${file}: 表 ${table} は持ち主の機能の関数を通して読む・書く` });
    }
  }
  return out;
}

/** CSS のクラスのセレクターの名前（コメント・文字・url() と、宣言の中の値は見ない。:not(.x) の中も拾う） */
export function cssClassesIn(css) {
  const text = css
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""')
    .replace(/url\([^)]*\)/g, "url()");
  const found = new Set();
  let chunk = "";
  for (const c of text) {
    if (c === "{") {
      // 「{」の前はセレクターか @ の規則の前置き
      for (const m of chunk.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) found.add(m[1]);
      chunk = "";
    } else if (c === ";" || c === "}") chunk = "";
    else chunk += c;
  }
  return [...found];
}

/** CSS のクラスの持ち主: いちばん長い頭の持ち主の CSS だけがそのクラスを書く。どの頭にも合わないクラスは free の CSS だけ */
export function checkCssClasses(sources, config) {
  const rule = config.cssClasses ?? {};
  const owners = [...(rule.owners ?? [])].sort((a, b) => b.prefix.length - a.prefix.length);
  const out = [];
  for (const [file, source] of sources) {
    if (!file.endsWith(".css") || !matchesAny(file, rule.files ?? [])) continue;
    for (const name of cssClassesIn(source)) {
      const owner = owners.find((o) => name.startsWith(o.prefix));
      if (owner ? matchesAny(file, owner.owner) : matchesAny(file, rule.free ?? [])) continue;
      const why = owner ? `頭 ${owner.prefix} の持ち主（${owner.owner.join("・")}）の CSS だけが書く` : "どの頭の持ち主でもないクラスは土台の共通の型の CSS だけが書く";
      out.push({ kind: "css", key: `css:${file}:${name}`, message: `${file}: .${name} は${why}` });
    }
  }
  return out;
}

/** 呼び出し・参照の名前（`Date.now`・`k.clock.now`。計算で引く [x] は名前にしない） */
function memberName(node) {
  if (node.type === "Identifier") return node.name;
  if (node.type === "ThisExpression") return "this";
  if (node.type !== "MemberExpression" || node.computed || node.property.type !== "Identifier") return null;
  const object = memberName(node.object);
  return object === null ? null : `${object}.${node.property.name}`;
}

const argsMatch = (item, node) => item.args === undefined || node.arguments.length === item.args;

/** 禁じる書き方が出る回数（forbid の call は関数の呼び出し、member は `a.b` の参照、new は new。args を書けば引数の数も合うものだけ） */
export function countForbidden(file, source, forbid) {
  let count = 0;
  new Visitor({
    CallExpression(node) {
      if (node.callee.type !== "Identifier") return;
      count += forbid.filter((f) => f.call === node.callee.name && argsMatch(f, node)).length;
    },
    NewExpression(node) {
      count += forbid.filter((f) => f.new !== undefined && f.new === memberName(node.callee) && argsMatch(f, node)).length;
    },
    MemberExpression(node) {
      const name = memberName(node);
      if (name !== null) count += forbid.filter((f) => f.member === name).length;
    },
  }).visit(parseCode(file, source).program);
  return count;
}

/** 禁じる書き方: 決まりごとに、files に合うファイル（allow を除く。テストは既定で除く）に禁じた書き方が何回出るか。値は回数 */
export function checkPatterns(sources, config) {
  const layers = config.layers ?? {};
  const out = [];
  for (const rule of config.patterns ?? []) {
    const files = expandLayers(rule.files, layers);
    for (const [file, source] of sources) {
      if (!isCodeFile(file) || !matchesAny(file, files) || matchesAny(file, rule.allow ?? []) || skipsTest(file, rule, config, "exclude")) continue;
      const count = countForbidden(file, source, rule.forbid);
      if (count > 0) out.push({ kind: "pattern", key: `pattern:${rule.name}:${file}`, value: count, message: `${file}: ${rule.message}（${count} か所）` });
    }
  }
  return out;
}
