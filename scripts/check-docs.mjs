// 文書の検査。決まりは scripts/docs.config.mjs。違反が 1 つでもあれば終了コード 1（コミット時のフックが止める）。
// 見るもの: 大きさの上限・祖先の CLAUDE.md との合計・長い行・書かない言葉・切れた参照・置かない CLAUDE.md・docs/features.md の形・
// docs/architecture.md の語彙の名前がコードにあるか・機能の表の並びが FEATURES と同じか・コードのコメントの書かない言葉
// node scripts/check-docs.mjs             … 確かめる（違反を 1 つずつ出す）
// node scripts/check-docs.mjs --comments  … コードのコメントの検査だけを流す
// node scripts/check-docs.mjs --count     … 種類ごとの数と合計を JSON で出す（終了コード 0）
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { matchesAny } from "./structure/parse.mjs";
import { measureDocs, summarize } from "./docs/measure.mjs";

export { countForbidden, countLongLines, headingRefsIn, headingsOf, pathRefsIn, refExists, resolveRef, tablesIn, vocabularyNames } from "./docs/markdown.mjs";
export { ancestorDocs, checkFeatures, commentViolations, limitFor, missingNames, orderErrors } from "./docs/rules.mjs";
export { measureDocs, summarize } from "./docs/measure.mjs";

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

async function main(args) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const config = (await import("./docs.config.mjs")).default;
  const measured = measureDocs({ ...readRepo(root, config), config, only: args.includes("--comments") ? "comments" : null });
  if (args.includes("--count")) {
    console.log(JSON.stringify(summarize(measured)));
    return 0;
  }
  for (const d of measured.details) console.error(`${where(d)}: ${d.message}`);
  printCounts(measured);
  if (measured.details.length === 0) return 0;
  console.error(`\n文書の検査で ${measured.details.length} 件が通りません（決まりは scripts/docs.config.mjs。文書の要る行は「docs-ignore: 理由」、コメントは「comment-rules-ignore: 理由」で見逃せます）`);
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main(process.argv.slice(2)));
}
