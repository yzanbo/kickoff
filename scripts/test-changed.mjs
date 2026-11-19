// 変えたファイルに関係するテストだけを流す（npm run test:changed / test:changed:isolated）。
// ファイルを渡せばそのファイル（コミット時のフックはコミットするファイル）、渡さなければまだコミットしていない変更に関係するテスト。
// --isolated でファイルごとに新しいプロセス（ほかのファイルが残した値に頼るテストを見つける）。付けなければプロセスを使い回す
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const args = process.argv.slice(2);
const isolated = args.includes("--isolated");
// 消したファイルは渡さない（関係するテストは、残ったファイルからたどる）
const files = args.filter((a) => a !== "--isolated" && existsSync(a));
const given = args.some((a) => a !== "--isolated");

const mode = isolated ? ["--isolate"] : ["--no-isolate"];
// 関係するテストがなくても失敗にしない（Markdown だけの変更など）
const target = given ? ["related", "--run", ...files] : ["run", "--changed"];
if (given && files.length === 0) process.exit(0);
const r = spawnSync("npx", ["vitest", ...target, ...mode, "--passWithNoTests"], { stdio: "inherit" });
process.exit(r.status ?? 1);
