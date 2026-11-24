// 作り直しの移動のスクリプト（全ファイルを新しい構成へ git mv し、import の指定とパスの文字を書き換える。作り直しが終わったら scripts/refactor ごと消す）。
//   node scripts/refactor/move.mjs check     [--table scripts/refactor/moves.tsv] [--partial]  表の検査（問題があれば終了コード 1）
//   node scripts/refactor/move.mjs plan      [--table …] [--partial]  検査のうえで、書き換える数と残りの見込みを出す（何も変えない）
//   node scripts/refactor/move.mjs apply     [--table …] [--partial]  動かして書き換える（コミットはしない）
//   node scripts/refactor/move.mjs leftovers                          移す前のパスが残っている所を出す
//   node scripts/refactor/move.mjs merge --base <付録_移動表.md> --fixes <分冊の .md …> --out scripts/refactor/moves.tsv
// --partial は一部のファイルだけを持つ表（名前の変更など）のときに付ける（表にないファイルを数えない）
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkTable, fixRowsOf, formatProblem, mergeTables, parseBaseTable, parseMoveTable } from "./table.mjs";
import { CURRENT_ALIASES, reportLeftovers, rewriteSource } from "./rewrite.mjs";

export { checkTable, fixRowsOf, formatProblem, mergeTables, parseBaseTable, parseMoveTable, FEATURES, KNOWN_EXCEPTIONS } from "./table.mjs";
export { resolveOld, rewriteSpecifier, rewriteSource, reportLeftovers } from "./rewrite.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_TABLE = "scripts/refactor/moves.tsv";

/** 中身を書き換えるファイル（src の全部と、src を読む mobile/src・scripts。このフォルダの道具は除く） */
const REWRITE_RANGE = /^(src\/|mobile\/src\/|scripts\/)(?!refactor\/).*\.(ts|tsx|mts|mjs|js|cjs|css|html)$/;
/** パスの文字（"src/…"）を表で書き換える設定のファイル（旧のパス）。react-compiler-skips のキーは「パス:関数名」 */
const PATH_STRING_FILES = ["src/app/renderer/react-compiler-skips.json"];
/** 残りを探さないファイル（移動表そのもの・このフォルダ・文書。文書のパスは別に直す） */
const NO_LEFTOVERS = /^scripts\/refactor\/|\.md$|\.tsv$|^test-records\/|\.(png|svg|icns|ico|jpg|woff2?)$/;
const SKIP_LEFTOVERS = (file) => NO_LEFTOVERS.test(file);

/** "src/…" の形のパスの文字を、表で新しいパスにする */
export function rewritePathStrings(text, byFrom) {
  return text.replace(/(["'`])(src\/[^"'`:\s]+)(?=[:"'`])/g, (whole, quote, p) => (byFrom.has(p) ? `${quote}${byFrom.get(p)}` : whole));
}

function git(args, options = {}) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...options });
}

function tracked() {
  return git(["ls-files", "-z"]).split("\0").filter(Boolean);
}

function read(file) {
  return readFileSync(path.resolve(ROOT, file), "utf8");
}

function optionOf(args, name, fallback) {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : fallback;
}

/** 表を読み、検査する */
function loadTable(args) {
  const rows = parseMoveTable(read(optionOf(args, "--table", DEFAULT_TABLE)));
  const files = tracked();
  const problems = checkTable(
    rows,
    files.filter((f) => f.startsWith("src/")),
    { partial: args.includes("--partial") },
  );
  return { rows, files, problems, byFrom: new Map(rows.map((r) => [r.from, r.to])) };
}

/** すべてのファイルの新しい中身を、旧の木で計算する（P2-2b のあとの木なので、別名はいまの tsconfig の paths で解く） */
function computeRewrites(files, byFrom) {
  const all = new Set(files);
  const ctx = { byFrom, exists: (p) => all.has(p), aliases: CURRENT_ALIASES };
  const out = [];
  for (const from of files) {
    const to = byFrom.get(from) ?? from;
    const isPathFile = PATH_STRING_FILES.includes(from);
    if (!REWRITE_RANGE.test(from) && !isPathFile) continue;
    const before = read(from);
    let count = 0;
    const unresolved = [];
    let after = REWRITE_RANGE.test(from) ? rewriteSource(from, to, before, ctx, () => count++, (spec) => unresolved.push(spec)) : before;
    if (isPathFile) after = rewritePathStrings(after, byFrom);
    out.push({ from, to, before, after, count, unresolved });
  }
  return out;
}

function printProblems(problems) {
  for (const p of problems) console.log(formatProblem(p));
  const byKind = Object.groupBy(problems, (p) => p.kind);
  console.log(`問題: ${problems.length}${problems.length ? `（${Object.entries(byKind).map(([k, v]) => `${k} ${v.length}`).join("・")}）` : ""}`);
}

/** 動かすファイルの旧のパス */
function movedOf(byFrom) {
  return new Set([...byFrom].filter(([from, to]) => from !== to).map(([from]) => from));
}

/** 書き換えたあとの木（メモリ）の残り */
function leftoversOf(rewrites, files, byFrom) {
  const next = new Map(rewrites.map((r) => [r.to, r.after]));
  const found = [];
  for (const from of files) {
    const to = byFrom.get(from) ?? from;
    if (SKIP_LEFTOVERS(to)) continue;
    found.push(...reportLeftovers([to], () => next.get(to) ?? read(from), movedOf(byFrom)));
  }
  return found;
}

function plan(args) {
  const { files, problems, byFrom } = loadTable(args);
  printProblems(problems);
  if (problems.length) return 1;
  const rewrites = computeRewrites(files, byFrom);
  const changed = rewrites.filter((r) => r.after !== r.before);
  const moved = [...byFrom].filter(([from, to]) => from !== to).length;
  console.log(`動かすファイル: ${moved}（動かさない ${byFrom.size - moved}）`);
  console.log(`中身を書き換えるファイル: ${changed.length}・書き換える指定: ${rewrites.reduce((n, r) => n + r.count, 0)}`);
  for (const area of ["src/", "mobile/src/", "scripts/"]) {
    const list = changed.filter((r) => r.from.startsWith(area));
    console.log(`  ${area}: ${list.length} ファイル・${list.reduce((n, r) => n + r.count, 0)} 指定`);
  }
  const unresolved = rewrites.flatMap((r) => r.unresolved.map((spec) => `${r.from}: ${spec}`));
  console.log(`解けない相対・別名の指定（変えない。テストの例の文字など）: ${unresolved.length}`);
  for (const u of unresolved) console.log(`  ${u}`);
  const leftovers = leftoversOf(rewrites, files, byFrom);
  console.log(`残りの見込み（移す前のパスの文字）: ${leftovers.length} 行`);
  for (const l of leftovers) console.log(`  ${l.file}:${l.line}: ${l.text}`);
  return 0;
}

/** 行き先が、まだ動いていないほかのファイルの場所なら、そのファイルを先に動かす順に並べる */
function moveOrder(moves) {
  const pending = new Map(moves.map((m) => [m.from, m]));
  const order = [];
  while (pending.size > 0) {
    const ready = [...pending.values()].filter((m) => !pending.has(m.to) || m.to === m.from);
    if (ready.length === 0) throw new Error(`動かす順が決まりません（行き先が輪になっています）: ${[...pending.keys()].slice(0, 5).join(" ")}`);
    for (const m of ready) pending.delete(m.from);
    order.push(ready);
  }
  return order;
}

/** 空になったフォルダを下から消す（Git が知らないファイルが残るフォルダは残して出す） */
function removeEmptyDirs(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return;
  for (const name of readdirSync(dir)) removeEmptyDirs(path.join(dir, name));
  const rest = readdirSync(dir).filter((n) => n !== ".DS_Store");
  if (rest.length === 0) {
    if (readdirSync(dir).length > 0) unlinkSync(path.join(dir, ".DS_Store"));
    rmdirSync(dir);
  }
}

function apply(args) {
  const { files, problems, byFrom } = loadTable(args);
  printProblems(problems);
  if (problems.length) return 1;
  if (git(["status", "--porcelain", "--", "src", "mobile/src", "scripts"]).trim() !== "") {
    console.error("コミットしていない変更があります（src・mobile/src・scripts）。先にコミットしてから流す");
    return 1;
  }
  // ① 新しい中身を旧の木で計算する
  const rewrites = computeRewrites(files, byFrom);
  // ② 行き先のフォルダを作り、git mv（同じ行き先のフォルダで名前の変わらないものはまとめて）
  const moves = [...byFrom].filter(([from, to]) => from !== to).map(([from, to]) => ({ from, to }));
  for (const batch of moveOrder(moves)) {
    const sameName = Object.groupBy(
      batch.filter((m) => path.posix.basename(m.from) === path.posix.basename(m.to)),
      (m) => path.posix.dirname(m.to),
    );
    for (const [dir, list] of Object.entries(sameName)) {
      mkdirSync(path.join(ROOT, dir), { recursive: true });
      for (let i = 0; i < list.length; i += 200) git(["mv", ...list.slice(i, i + 200).map((m) => m.from), `${dir}/`]);
    }
    for (const m of batch.filter((x) => path.posix.basename(x.from) !== path.posix.basename(x.to))) {
      mkdirSync(path.join(ROOT, path.posix.dirname(m.to)), { recursive: true });
      git(["mv", m.from, m.to]);
    }
  }
  // ③ 新しい中身を新のパスへ書く（④ のパスの文字の書き換えも、この中身に入っている）
  let written = 0;
  for (const r of rewrites) {
    if (r.after === r.before) continue;
    writeFileSync(path.join(ROOT, r.to), r.after);
    written++;
  }
  // ⑤ 空になった旧のフォルダを消す
  for (const dir of ["src/core", "src/main", "src/preload", "src/renderer", "src/shared"]) removeEmptyDirs(path.join(ROOT, dir));
  const restDirs = ["src/core", "src/main", "src/preload", "src/renderer"].filter((d) => existsSync(path.join(ROOT, d)));
  console.log(`動かした: ${moves.length}・中身を書き換えた: ${written}`);
  if (restDirs.length) console.log(`残ったフォルダ（Git が知らないファイルがある）: ${restDirs.join(" ")}`);
  // ⑥ 残り
  return leftovers(args);
}

function leftovers(args = []) {
  const names = tracked().filter((f) => !SKIP_LEFTOVERS(f) && existsSync(path.join(ROOT, f)));
  const tablePath = path.resolve(ROOT, optionOf(args, "--table", DEFAULT_TABLE));
  const found = reportLeftovers(names, read, existsSync(tablePath) ? movedOf(new Map(parseMoveTable(readFileSync(tablePath, "utf8")).map((r) => [r.from, r.to]))) : new Set());
  for (const l of found) console.log(`${l.file}:${l.line}: ${l.text}`);
  console.log(`移す前のパスの残り: ${found.length} 行`);
  return 0;
}

function check(args) {
  const { problems } = loadTable(args);
  printProblems(problems);
  return problems.length ? 1 : 0;
}

/** 付録の表に各分冊の直しを当てて書き出す */
function merge(args) {
  const base = parseBaseTable(readFileSync(optionOf(args, "--base"), "utf8"));
  const at = args.indexOf("--fixes");
  const fixFiles = [];
  for (let i = at + 1; at >= 0 && i < args.length && !args[i].startsWith("--"); i++) fixFiles.push(args[i]);
  const fixes = fixFiles.map((file) => ({ name: path.basename(file).slice(0, 2), rows: fixRowsOf(readFileSync(file, "utf8")) }));
  const { rows, rejected, unresolved } = mergeTables(base, fixes);
  const lines = ["# 作り直しの移動表（旧パス<TAB>新パス）。付録の表に各分冊の 5 章の直しを当てたもの。作り直しが終わったら scripts/refactor ごと消す"];
  for (const r of rejected) lines.push(`# 採らない: 分冊 ${r.name} ${r.from} ${r.to}（${r.why}）`);
  for (const u of unresolved) lines.push(`# 決まらない: ${u.from} ${u.candidates.map((c) => `${c.name}=${c.to}`).join(" ")}`);
  for (const r of rows) lines.push(`${r.from}\t${r.to}`);
  writeFileSync(optionOf(args, "--out", path.join(ROOT, DEFAULT_TABLE)), `${lines.join("\n")}\n`);
  console.log(`行: ${rows.length}・直しの行: ${fixes.reduce((n, f) => n + f.rows.length, 0)}・採らない: ${rejected.length}・決まらない: ${unresolved.length}`);
  return unresolved.length ? 1 : 0;
}

const COMMANDS = { check, plan, apply, leftovers, merge };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  const run = COMMANDS[command];
  if (!run) {
    console.error(`使い方: node scripts/refactor/move.mjs <${Object.keys(COMMANDS).join("|")}> [--table ${DEFAULT_TABLE}] [--partial]`);
    process.exit(1);
  }
  process.exit(run(args));
}
