// 文書の検査（0018 の作り直しの間は「減らすだけ」の基準線つき）。決まりは scripts/docs.config.mjs、基準線は scripts/docs-baseline.json。
// 見るもの: 大きさの上限・祖先の CLAUDE.md との合計・長い行・書かない言葉・切れた参照・置かない CLAUDE.md・docs/features.md の形・
// docs/architecture.md の語彙の名前がコードにあるか・コードのコメントの書かない言葉
// node scripts/check-docs.mjs                 … 確かめる（基準線にない違反・増えた違反・直ったのに基準線に残る違反があれば終了コード 1）
// node scripts/check-docs.mjs --count         … 種類ごとの数と合計を JSON で出す（終了コード 0）
// node scripts/check-docs.mjs --report        … いまの違反を 1 つずつ出す（終了コード 0。数えるだけ）
// node scripts/check-docs.mjs --comments      … コードのコメントの検査だけを流す（--report と一緒に使える）
// node scripts/check-docs.mjs --write-baseline [--allow-grow] … いまの数で基準線を書き直す（増えるときは --allow-grow がなければ断る）
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { matchesAny } from "./structure/parse.mjs";
import { baselineFrom, compareWithBaseline, measureDocs, summarize } from "./docs/measure.mjs";

export { countForbidden, countLongLines, headingRefsIn, headingsOf, pathRefsIn, refExists, resolveRef, tablesIn, vocabularyNames } from "./docs/markdown.mjs";
export { ancestorDocs, checkFeatures, commentViolations, limitFor, missingNames } from "./docs/rules.mjs";
export { baselineFrom, compareWithBaseline, measureDocs, summarize } from "./docs/measure.mjs";

/** コメントと語彙の名前を探すファイル（文字のファイルだけ。CLAUDE.md などの文書は語彙の名前の実在に数えない） */
const SOURCE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|css|html|json)$/;

function readRepo(root, config) {
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0")
    .filter(Boolean);
  const files = new Set(tracked);
  const read = (file) => readFileSync(path.join(root, file), "utf8");
  const exists = (file) => existsSync(path.join(root, file));
  const markdown = new Map(tracked.filter((f) => f.endsWith(".md") && exists(f)).map((f) => [f, read(f)]));
  const docs = new Map([...markdown].filter(([f]) => matchesAny(f, config.files ?? [])));
  const searchDirs = config.vocabulary?.search ?? [];
  const wanted = (f) => SOURCE_FILE.test(f) && (searchDirs.some((dir) => f.startsWith(`${dir}/`)) || matchesAny(f, config.commentFiles ?? []));
  const code = new Map(tracked.filter((f) => wanted(f) && exists(f)).map((f) => [f, read(f)]));
  return { files, markdown, docs, code };
}

/** 上限の差し替え（scripts/docs-limits.mjs があれば、その DOC_LIMITS を limits より先に当てる） */
async function readExtraLimits(root) {
  const file = path.join(root, "scripts", "docs-limits.mjs");
  if (!existsSync(file)) return [];
  return (await import(pathToFileURL(file).href)).DOC_LIMITS ?? [];
}

function readBaseline(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { version: 1, files: {}, comments: {}, vocabulary: 0, forbiddenFiles: [] };
}

const LABELS = {
  overBytes: "上限を超えたファイル",
  overAncestors: "祖先との合計が上限を超えた CLAUDE.md",
  longLines: "長い行",
  forbidden: "書かない言葉",
  brokenRefs: "切れた参照",
  comments: "コメントの書かない言葉",
  vocabulary: "コードにない語彙",
  forbiddenFiles: "置かない CLAUDE.md",
  features: "機能の一覧の誤り",
};

function printCounts(measured) {
  const counts = summarize(measured);
  const parts = Object.keys(LABELS)
    .filter((key) => counts[key] > 0)
    .map((key) => `${LABELS[key]} ${counts[key]}`);
  console.log(`文書 ${counts.files}・いまの違反: ${counts.total}${parts.length > 0 ? `（${parts.join("・")}）` : ""}`);
}

const where = (d) => (d.line === undefined ? d.file : `${d.file}:${d.line}`);

/** 落ちた項目の下に、その項目の違反の 1 つずつを出す */
function printFailure(text, measured) {
  console.error(text);
  for (const d of measured.details) {
    // 機能の一覧と置かない CLAUDE.md は、項目の文にもう中身がある
    if (d.metric === "features" || d.metric === "forbiddenFiles") continue;
    if (text.startsWith(d.metric === "vocabulary" ? "vocabulary" : `${d.metric}:${d.file}:`)) console.error(`    ${where(d)}: ${d.message}`);
  }
}

/** 確かめる。落とすなら 1 を返す */
function check(measured, baseline) {
  const { added, stale, grown, shrunk } = compareWithBaseline(measured, baseline);
  for (const text of added) printFailure(`${text}（基準線にない違反）`, measured);
  for (const text of grown) printFailure(`${text}（基準線より増えた。増やさない）`, measured);
  for (const key of stale) console.error(`${key}: 直ったので基準線から消す（node scripts/check-docs.mjs --write-baseline）`);
  for (const text of shrunk) console.log(`${text}（--write-baseline で基準線の値を下げられる）`);
  printCounts(measured);
  const failed = added.length + grown.length + stale.length;
  if (failed > 0) {
    console.error(`\n文書の検査で ${failed} 件が通りません（新しい違反 ${added.length}・増えた ${grown.length}・基準線に残る ${stale.length}。決まりは scripts/docs.config.mjs。要る行は「docs-ignore: 理由」で見逃せます）`);
    return 1;
  }
  return 0;
}

/** 基準線を書き直す。増えるときに allowGrow でなければ断る（1 を返す） */
function writeBaseline(measured, baseline, file, allowGrow) {
  const { added, grown } = compareWithBaseline(measured, baseline);
  if (!allowGrow && added.length + grown.length > 0) {
    for (const text of added) console.error(`新しい違反: ${text}`);
    for (const text of grown) console.error(`増えた違反: ${text}`);
    console.error("\n基準線を増やす書き直しは断りました（増やしてよいのは 0018 の P0-5d の作成と P2-4 の取り直しだけ。--allow-grow）");
    return 1;
  }
  writeFileSync(file, `${JSON.stringify(baselineFrom(measured), null, 2)}\n`);
  console.log(`基準線を書き直しました: ${path.basename(file)}`);
  printCounts(measured);
  return 0;
}

async function main(args) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const config = (await import("./docs.config.mjs")).default;
  const onlyComments = args.includes("--comments") && !args.includes("--write-baseline");
  const measured = measureDocs({ ...readRepo(root, config), config, extraLimits: await readExtraLimits(root), only: onlyComments ? "comments" : null });
  const baselineFile = path.join(root, "scripts", "docs-baseline.json");
  const baseline = readBaseline(baselineFile);
  if (args.includes("--count")) {
    console.log(JSON.stringify(summarize(measured)));
    return 0;
  }
  if (args.includes("--report")) {
    for (const d of measured.details) console.log(`${where(d)}: ${d.message}`);
    printCounts(measured);
    return 0;
  }
  if (args.includes("--write-baseline")) return writeBaseline(measured, baseline, baselineFile, args.includes("--allow-grow"));
  return check(measured, onlyComments ? { comments: baseline.comments } : baseline);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main(process.argv.slice(2)));
}
