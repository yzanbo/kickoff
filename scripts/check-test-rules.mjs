// テストの書き方の見張り（コミットのときのフックが流す。node scripts/check-test-rules.mjs [ファイル…]）。
// テストは同じプロセスで続けて流れる（npm test）ので、前のテストの値をほかのファイルに残す書き方を、流す前に見つける。
// ファイルを渡さなければ、Git が知っているテストのファイルとテストの補助をすべて見る。
// どうしても要る行は、その行か 1 つ上の行に「test-rules-ignore: 理由」と書けば見逃す
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 見張る決まり（パターンと、代わりにどう書くか） */
export const TEST_RULES = [
  { pattern: /from\s+["']node:test["']/, message: "テストは Vitest で書く（import { test } from \"vitest\"）" },
  { pattern: /\bglobalThis(\.[\w$]+|\[[^\]]+\])\s*(?:\?\?|\|\||&&)?=(?!=)/, message: "グローバルは vi.stubGlobal で変える（テストごとに自動で戻る）" },
  { pattern: /\bObject\.(assign|defineProperty|defineProperties)\(\s*globalThis\b/, message: "グローバルは vi.stubGlobal で変える（テストごとに自動で戻る）" },
  { pattern: /\bprocess\.env(\.[\w$]+|\[[^\]]+\])\s*(?:\?\?|\|\||&&)?=(?!=)/, message: "環境変数は vi.stubEnv で変える（テストごとに自動で戻る）" },
  { pattern: /\bdelete\s+process\.env\b/, message: "環境変数は vi.stubEnv で変える（消すなら vi.stubEnv(名前, undefined)）" },
  { pattern: /\bObject\.assign\(\s*process\.env\b/, message: "環境変数は vi.stubEnv で変える（テストごとに自動で戻る）" },
  { pattern: /\bprocess\.chdir\(/, message: "今のフォルダを変えない（プロセス全体に残る。パスを渡す）" },
  // 小文字で始まる値の後ろの ["名前"]（型の Chat["status"] は見ない）
  { pattern: /(?<![\w$.\])])[a-z_$][\w$]*(?:\??\.[\w$]+)*\[\s*(["'])[A-Za-z_$][\w$]*\1\s*\]/, message: "角かっこで名前を読まない（private を読む書き方。公開の口か testing.ts の補助を使う。`.x` で書けるなら `.x`）" },
  { pattern: /as unknown as \{[^}]*\}\)\.[\w$]+\s*=(?!=)/, message: "偽物に後から口を生やさない（偽物の作り方で渡す）" },
  { pattern: /new Promise\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*setTimeout\(\s*\1\s*,\s*[1-9]/, message: "決め打ちの時間で待たない（until・時計を進める・settle()）" },
  { pattern: /\bvi\.mock\(/, message: "vi.mock で import 先を差し替えない（計算をモデルの関数に出して確かめる）" },
  { pattern: /["']:memory:["']/, message: "メモリの DB は createTestCore か memoryDb() で作る（テストの中で開かない）" },
];

/** ファイルの行の上限（テストは 400・補助は 300。1 行目に「test-rules-ignore-file: 理由」があれば見逃す） */
export const MAX_TEST_LINES = 400;
export const MAX_HELPER_LINES = 300;
const IGNORE_FILE = "test-rules-ignore-file:";

const IGNORE = "test-rules-ignore:";

/** 見張るファイルか（テストのファイルと、テストからだけ使う補助） */
export function isTestSource(file) {
  const p = file.split(path.sep).join("/");
  return /\.(test|dbtest)\.(ts|tsx|mjs)$/.test(p) || /(^|\/)testing(\/[^/]+)?\.(ts|tsx|mjs)$/.test(p) || p === "vitest.setup.ts";
}

/** 1 つのファイルの違反（行の番号は 1 から。file を渡せば大きさも見る） */
export function findViolations(text, file = null) {
  const lines = text.split("\n");
  const found = [];
  if (file !== null && !lines[0]?.includes(IGNORE_FILE)) {
    const max = /\.(test|dbtest)\.(ts|tsx|mjs)$/.test(file) ? MAX_TEST_LINES : MAX_HELPER_LINES;
    const count = text.endsWith("\n") ? lines.length - 1 : lines.length;
    if (count > max) found.push({ line: 1, text: `${count} 行`, message: `ファイルは ${max} 行まで（まとまりごとに分ける。分けられない理由があれば 1 行目に「// ${IGNORE_FILE} 理由」）` });
  }
  lines.forEach((line, i) => {
    if (line.includes(IGNORE) || lines[i - 1]?.includes(IGNORE)) return;
    // 行のコメントだけの行は見ない（説明の中の例）
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    // 1 行に 1 つ（先に書いた決まりから）
    const rule = TEST_RULES.find((r) => r.pattern.test(line));
    if (rule) found.push({ line: i + 1, text: line.trim(), message: rule.message });
  });
  return found;
}

function trackedTestSources(root) {
  const out = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
  return out.split("\0").filter((f) => f && isTestSource(f));
}

/** ファイルを見て、違反を出力して数を返す */
export function checkTestRules(files, root = process.cwd()) {
  const targets = (files.length > 0 ? files : trackedTestSources(root)).filter((f) => isTestSource(f) && existsSync(path.resolve(root, f)));
  let count = 0;
  for (const file of targets) {
    for (const v of findViolations(readFileSync(path.resolve(root, file), "utf8"), file)) {
      count++;
      console.error(`${file}:${v.line}: ${v.message}\n    ${v.text}`);
    }
  }
  if (count > 0) console.error(`\nテストの書き方の決まりに合わない行が ${count} か所あります（決まりは CLAUDE.md の「確かめ方」。要る行は「// ${IGNORE} 理由」で見逃せます）`);
  return count;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(checkTestRules(process.argv.slice(2)) > 0 ? 1 : 0);
}
