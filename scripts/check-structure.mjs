// 構造の検査（0018 の作り直しの間は「減らすだけ」の基準線つき）。決まりは scripts/structure.config.mjs、基準線は scripts/structure-baseline.json。
// node scripts/check-structure.mjs                 … 確かめる（基準線にない違反・増えた違反・直ったのに基準線に残る違反があれば終了コード 1）
// node scripts/check-structure.mjs --count         … 種類ごとの数と合計を JSON で出す（終了コード 0）
// node scripts/check-structure.mjs --list <種類>   … いまの違反を並べる
// node scripts/check-structure.mjs --write-baseline [--allow-grow] … いまの違反で基準線を書き直す（増えるときは --allow-grow がなければ断る）
// node scripts/check-structure.mjs --no-baseline   … 基準線を読まずに、いまの違反を全部出す（違反があれば終了コード 1）
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildGraph, expandLayers, isCodeFile, matchesAny } from "./structure/parse.mjs";
import { checkFileSizes, checkImports, checkNativeAccess, checkPlacement, checkPublicApi, findSiblingCycles } from "./structure/checks.mjs";
import { checkCssClasses, checkPatterns, checkSqlTables } from "./structure/content.mjs";

export { buildGraph, expandLayers, globToRegExp, matchesAny, parseImports, resolveSpecifier } from "./structure/parse.mjs";
export { checkFileSizes, checkImports, checkNativeAccess, checkPlacement, checkPublicApi, findSiblingCycles } from "./structure/checks.mjs";
export { checkCssClasses, checkPatterns, checkSqlTables, countForbidden, cssClassesIn, sqlTablesIn } from "./structure/content.mjs";

/** 違反の種類（基準線の並び順）。値を持つ種類は、基準線に { 鍵: 値 } で載せ、値が増えたら落とす */
export const KINDS = ["import", "public", "cycle", "size", "native", "sql", "css", "pattern", "placement"];
const VALUED = new Set(["size", "pattern"]);

/** 行の数（エディタの行の数。最後の改行のあとは数えない） */
export function countLines(text) {
  if (text === "") return 0;
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

/** 違反の鍵から、基準線の中の鍵（種類の頭を外したもの）にする */
function baselineKey(violation) {
  return violation.key.slice(violation.kind.length + 1);
}

/** 循環の鍵（決まり:親:フォルダ,…）のフォルダが、基準線の同じ決まりと親の鍵のフォルダに含まれれば、その基準線の鍵（輪から抜けたフォルダがあるだけ = 減った） */
function widerCycle(key, baseKeys) {
  const at = key.lastIndexOf(":");
  const members = key.slice(at + 1).split(",");
  return baseKeys.find((b) => b.slice(0, b.lastIndexOf(":") + 1) === key.slice(0, at + 1) && members.every((m) => b.slice(b.lastIndexOf(":") + 1).split(",").includes(m)));
}

/**
 * いまの違反と基準線を比べる。added は新しい違反、stale は直ったのに基準線に残る鍵、grown は値が増えた違反、shrunk は値が減った違反（通す）。
 * 循環の輪からフォルダが抜けて鍵が変わったものは shrunk（from・to は鍵。前の鍵は stale に出るので --write-baseline で書き直す）
 */
export function compareWithBaseline(violations, baseline) {
  const base = baseline?.violations ?? {};
  const added = [];
  const grown = [];
  const shrunk = [];
  const seen = new Set();
  for (const v of violations) {
    const key = baselineKey(v);
    seen.add(`${v.kind}\0${key}`);
    if (VALUED.has(v.kind)) {
      const from = base[v.kind]?.[key];
      if (from === undefined) added.push(v);
      else if (v.value > from) grown.push({ key: v.key, from, to: v.value });
      else if (v.value < from) shrunk.push({ key: v.key, from, to: v.value });
    } else if (!(base[v.kind] ?? []).includes(key)) {
      const wider = v.kind === "cycle" ? widerCycle(key, base.cycle ?? []) : undefined;
      if (wider) shrunk.push({ key: v.key, from: wider, to: key });
      else added.push(v);
    }
  }
  const stale = [];
  for (const kind of KINDS) {
    const keys = VALUED.has(kind) ? Object.keys(base[kind] ?? {}) : (base[kind] ?? []);
    for (const key of keys) if (!seen.has(`${kind}\0${key}`)) stale.push(`${kind}:${key}`);
  }
  return { added, stale, grown, shrunk };
}

/** いまの違反から基準線を作る（鍵の順に並べ、差分を読みやすくする） */
export function baselineFrom(violations) {
  const out = {};
  for (const kind of KINDS) {
    const list = violations.filter((v) => v.kind === kind).sort((a, b) => (a.key < b.key ? -1 : 1));
    out[kind] = VALUED.has(kind) ? Object.fromEntries(list.map((v) => [baselineKey(v), v.value])) : list.map(baselineKey);
  }
  return { version: 1, violations: out };
}

/** 種類ごとの数と合計 */
export function countByKind(violations) {
  const counts = Object.fromEntries(KINDS.map((kind) => [kind, 0]));
  for (const v of violations) counts[v.kind]++;
  return { ...counts, total: violations.length };
}

/** 読んだファイルの中身から、すべての種類の違反を出す（入出力をしない） */
export function collectViolations({ sources, files, config }) {
  const code = new Map([...sources].filter(([file]) => isCodeFile(file) && matchesAny(file, config.files ?? [])));
  const graph = buildGraph(code, config, files);
  const lineCounts = new Map([...sources].map(([file, text]) => [file, countLines(text)]));
  return [
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

function readBaseline(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { version: 1, violations: {} };
}

function printCounts(violations) {
  const counts = countByKind(violations);
  const parts = KINDS.filter((kind) => counts[kind] > 0).map((kind) => `${kind} ${counts[kind]}`);
  console.log(`いまの違反: ${counts.total}${parts.length > 0 ? `（${parts.join("・")}）` : ""}`);
}

/** 確かめる。落とすなら 1 を返す */
function check(violations, baseline) {
  const { added, stale, grown, shrunk } = compareWithBaseline(violations, baseline);
  for (const v of added) console.error(`${v.message}\n    ${v.key}`);
  for (const g of grown) console.error(`${g.key}: ${g.from} → ${g.to}（基準線より増えた。増やさない）`);
  for (const key of stale) console.error(`${key}: 直ったので基準線から消す（node scripts/check-structure.mjs --write-baseline）`);
  for (const s of shrunk) console.log(`${s.key}: ${s.from} → ${s.to}（--write-baseline で基準線の値を下げられる）`);
  printCounts(violations);
  const failed = added.length + grown.length + stale.length;
  if (failed > 0) {
    console.error(`\n構造の検査で ${failed} 件が通りません（新しい違反 ${added.length}・増えた ${grown.length}・基準線に残る ${stale.length}。決まりは scripts/structure.config.mjs）`);
    return 1;
  }
  return 0;
}

/** 基準線を書き直す。増えるときに allowGrow でなければ断る（1 を返す） */
function writeBaseline(violations, baseline, file, allowGrow) {
  const { added, grown } = compareWithBaseline(violations, baseline);
  if (!allowGrow && added.length + grown.length > 0) {
    for (const v of added) console.error(`新しい違反: ${v.key}`);
    for (const g of grown) console.error(`増えた違反: ${g.key}（${g.from} → ${g.to}）`);
    console.error("\n基準線を増やす書き直しは断りました（増やしてよいのは 0018 の P0-5b の作成と P2-4 の取り直しだけ。--allow-grow）");
    return 1;
  }
  writeFileSync(file, `${JSON.stringify(baselineFrom(violations), null, 2)}\n`);
  console.log(`基準線を書き直しました: ${path.basename(file)}`);
  printCounts(violations);
  return 0;
}

async function main(args) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const config = (await import("./structure.config.mjs")).default;
  const violations = collectViolations({ ...readRepo(root, config), config });
  const baselineFile = path.join(root, "scripts", "structure-baseline.json");
  const baseline = readBaseline(baselineFile);
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
  if (args.includes("--write-baseline")) return writeBaseline(violations, baseline, baselineFile, args.includes("--allow-grow"));
  return check(violations, args.includes("--no-baseline") ? { version: 1, violations: {} } : baseline);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main(process.argv.slice(2)));
}
