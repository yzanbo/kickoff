// 構造の検査（scripts/check-structure.mjs）の種類のうち、ファイルの中身で見るもの: SQL の表の持ち主・CSS のクラスの持ち主・禁じる書き方。
// コードは構文木（oxc-parser）で読み、コメントを拾わない
import { Visitor } from "oxc-parser";
import { expandLayers, isCodeFile, matchesAny, parseCode } from "./parse.mjs";
import { ancestors, skipsTest } from "./checks.mjs";

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

/** CSS の規則のセレクター（コメント・文字・url() と宣言は見ない。@media などの中も拾い、@keyframes の中は拾わない。カンマで分けて返す） */
export function cssSelectorsIn(css) {
  const text = css
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""')
    .replace(/url\([^)]*\)/g, "url()");
  const selectors = [];
  const keyframes = [];
  let chunk = "";
  for (const c of text) {
    if (c === "{") {
      // 「{」の前はセレクターか @ の規則の前置き
      const head = chunk.trim().replace(/\s+/g, " ");
      const inKeyframes = keyframes.includes(true);
      keyframes.push(/^@(-webkit-)?keyframes\b/.test(head));
      if (!head.startsWith("@") && !inKeyframes) selectors.push(...splitTopLevel(head));
      chunk = "";
    } else if (c === "}") {
      keyframes.pop();
      chunk = "";
    } else if (c === ";") chunk = "";
    else chunk += c;
  }
  return selectors;
}

/** 括弧の外のカンマで分ける（:is(.a, .b) の中では分けない） */
function splitTopLevel(selector) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const c of selector) {
    if (c === "(") depth++;
    else if (c === ")") depth--;
    if (c === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += c;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

const CLASS_NAME = /^\.(-?[_a-zA-Z][\w-]*)/;

/** セレクターの最初のクラス。括弧の外を先に見て、外になければ括弧の中の最初（:where(.a) .b は b、:is(.a) は a）。クラスがなければ null */
export function firstCssClass(selector) {
  let depth = 0;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "." && depth === 0) {
      const m = CLASS_NAME.exec(selector.slice(i));
      if (m) return m[1];
    }
  }
  const m = /\.(-?[_a-zA-Z][\w-]*)/.exec(selector);
  return m ? m[1] : null;
}

/**
 * CSS のクラスの持ち主: セレクターの最初のクラスは、1 つの領域（areas に合うフォルダ。機能・土台・殻）の CSS だけが書く。
 * ほかの領域の要素の中だけで変える規則は、入れ物の持ち主の CSS へ移すか、`.自分:is(.入れ物 *)` と書く
 */
export function checkCssClasses(sources, config) {
  const rule = config.cssClasses ?? {};
  const writers = new Map();
  for (const [file, source] of sources) {
    if (!file.endsWith(".css") || !matchesAny(file, rule.files ?? [])) continue;
    const area = ancestors(file).find((dir) => matchesAny(dir, rule.areas ?? [])) ?? file;
    for (const selector of cssSelectorsIn(source)) {
      const name = firstCssClass(selector);
      if (name === null) continue;
      if (!writers.has(name)) writers.set(name, new Map());
      const files = writers.get(name);
      if (!files.has(file)) files.set(file, area);
    }
  }
  const out = [];
  for (const [name, files] of writers) {
    const areas = [...new Set(files.values())];
    if (areas.length < 2) continue;
    for (const [file] of files) {
      out.push({ kind: "css", key: `css:${file}:${name}`, message: `${file}: .${name} を最初のクラスに書く領域が 2 つある（${areas.join("・")}）。入れ物の持ち主の CSS へ移すか、.自分:is(.${name} *) と書く` });
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
/** 型の引数の文字（空白は 1 つにそろえる。`new Set<() => void>()` の `() => void`） */
const typeArgsOf = (node, source) => (node.typeArguments ? source.slice(node.typeArguments.start + 1, node.typeArguments.end - 1).replace(/\s+/g, " ").trim() : null);
const typeArgsMatch = (item, node, source) => item.typeArgs === undefined || typeArgsOf(node, source) === item.typeArgs;

/** export する名前（export const・function・type・interface・{ a as b }。default と export * は "*"） */
function exportedNames(node) {
  if (node.type !== "ExportNamedDeclaration") return ["*"];
  const d = node.declaration;
  if (!d) return node.specifiers.map((s) => s.exported.name ?? s.exported.value);
  if (d.type === "VariableDeclaration") return d.declarations.map((v) => (v.id.type === "Identifier" ? v.id.name : "*"));
  return [d.id?.name ?? "*"];
}

/** 禁じる書き方が出る回数（forbid の call は関数の呼び出し、member は `a.b` の参照、new は new、exportExcept は並べた名前のほかの export。args を書けば引数の数、typeArgs を書けば型の引数も合うものだけ） */
export function countForbidden(file, source, forbid) {
  let count = 0;
  new Visitor({
    CallExpression(node) {
      if (node.callee.type !== "Identifier") return;
      count += forbid.filter((f) => f.call === node.callee.name && argsMatch(f, node)).length;
    },
    NewExpression(node) {
      count += forbid.filter((f) => f.new !== undefined && f.new === memberName(node.callee) && argsMatch(f, node) && typeArgsMatch(f, node, source)).length;
    },
    MemberExpression(node) {
      const name = memberName(node);
      if (name !== null) count += forbid.filter((f) => f.member === name).length;
    },
    ...Object.fromEntries(
      ["ExportNamedDeclaration", "ExportDefaultDeclaration", "ExportAllDeclaration"].map((type) => [
        type,
        (node) => {
          for (const name of exportedNames(node)) count += forbid.filter((f) => f.exportExcept && !f.exportExcept.includes(name)).length;
        },
      ]),
    ),
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
