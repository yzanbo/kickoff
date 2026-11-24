// 構造の検査。決まりは scripts/structure.config.mjs（決まりの例外は、その表に理由つきで書く）。
// node scripts/check-structure.mjs                 … 確かめる（違反が 1 つでもあれば終了コード 1）
// node scripts/check-structure.mjs --count         … 種類ごとの数と合計を JSON で出す（終了コード 0）
// node scripts/check-structure.mjs --list <種類>   … いまの違反を並べる
// 確かめるときは、1 つの機能だけが読む土台のファイルも警告として出す（落とさない）
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildGraph, expandLayers, isCodeFile, matchesAny } from "./structure/parse.mjs";
import { checkFileSizes, checkImports, checkNativeAccess, checkPlacement, checkPublicApi, findSiblingCycles, findSingleUse } from "./structure/checks.mjs";
import { checkCssClasses, checkPatterns, checkSqlTables } from "./structure/content.mjs";

export { buildGraph, expandLayers, globToRegExp, matchesAny, parseImports, resolveSpecifier } from "./structure/parse.mjs";
export { checkFileSizes, checkImports, checkNativeAccess, checkPlacement, checkPublicApi, findSiblingCycles, findSingleUse } from "./structure/checks.mjs";
export { checkCssClasses, checkPatterns, checkSqlTables, countForbidden, cssSelectorsIn, firstCssClass, sqlTablesIn } from "./structure/content.mjs";

/** 違反の種類（数を出す並び順） */
export const KINDS = ["import", "public", "cycle", "size", "native", "sql", "css", "pattern", "placement"];

/** 行の数（エディタの行の数。最後の改行のあとは数えない） */
export function countLines(text) {
  if (text === "") return 0;
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

/** 種類ごとの数と合計 */
export function countByKind(violations) {
  const counts = Object.fromEntries(KINDS.map((kind) => [kind, 0]));
  for (const v of violations) counts[v.kind]++;
  return { ...counts, total: violations.length };
}

/** 読んだファイルの中身から、すべての種類の違反を出す（入出力をしない） */
export function collectViolations({ sources, files, config }) {
  return collect({ sources, files, config }).violations;
}

/** 違反と、警告（1 つの機能だけが読む土台のファイル） */
function collect({ sources, files, config }) {
  const code = new Map([...sources].filter(([file]) => isCodeFile(file) && matchesAny(file, config.files ?? [])));
  const graph = buildGraph(code, config, files);
  const lineCounts = new Map([...sources].map(([file, text]) => [file, countLines(text)]));
  const violations = [
    ...checkImports(graph, config),
    ...checkPublicApi(graph, config),
    ...findSiblingCycles(graph, config),
    ...checkFileSizes(lineCounts, config),
    ...checkNativeAccess(sources, config),
    ...checkSqlTables(sources, config),
    ...checkCssClasses(sources, config),
    ...checkPatterns(sources, config),
    ...checkPlacement([...files].sort(), config),
  ];
  return { violations, singleUse: findSingleUse(graph, config) };
}

/** 検査が読むファイル（設定の各 files に合う、Git が知っているファイル） */
function wantedGlobs(config) {
  return [
    ...(config.files ?? []),
    ...(config.fileSize?.files ?? []),
    ...(config.nativeAccess?.files ?? []),
    ...(config.sqlTables?.files ?? []),
    ...(config.cssClasses?.files ?? []),
    ...(config.patterns ?? []).flatMap((rule) => expandLayers(rule.files, config.layers ?? {})),
  ];
}

function readRepo(root, config) {
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0")
    .filter(Boolean);
  const files = new Set(tracked);
  const globs = wantedGlobs(config);
  const sources = new Map();
  for (const file of tracked) {
    const abs = path.join(root, file);
    if (matchesAny(file, globs) && existsSync(abs)) sources.set(file, readFileSync(abs, "utf8"));
  }
  return { sources, files };
}

function printCounts(violations) {
  const counts = countByKind(violations);
  const parts = KINDS.filter((kind) => counts[kind] > 0).map((kind) => `${kind} ${counts[kind]}`);
  console.log(`いまの違反: ${counts.total}${parts.length > 0 ? `（${parts.join("・")}）` : ""}`);
}

/** 確かめる。落とすなら 1 を返す */
function check(violations) {
  for (const v of violations) console.error(`${v.message}\n    ${v.key}${v.value === undefined ? "" : `（${v.value}）`}`);
  printCounts(violations);
  if (violations.length > 0) {
    console.error(`\n構造の検査で ${violations.length} 件が通りません（決まりは scripts/structure.config.mjs）`);
    return 1;
  }
  return 0;
}

async function main(args) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const config = (await import("./structure.config.mjs")).default;
  const { violations, singleUse } = collect({ ...readRepo(root, config), config });
  if (args.includes("--count")) {
    console.log(JSON.stringify(countByKind(violations)));
    return 0;
  }
  const listAt = args.indexOf("--list");
  if (listAt >= 0) {
    const kind = args[listAt + 1];
    for (const v of violations.filter((x) => x.kind === kind)) console.log(v.value === undefined ? v.key : `${v.key}\t${v.value}`);
    return 0;
  }
  for (const u of singleUse) console.warn(`警告: ${u.file} を読む機能は ${u.feature} だけ（土台は 2 つ以上の機能が使うもの。機能へ戻すか、残すなら structure.config.mjs の singleUse.keep へ）`);
  return check(violations);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main(process.argv.slice(2)));
}
