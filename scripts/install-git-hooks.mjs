// git のフック（.githooks/。コミット時・push 時の確かめ）を、このリポジトリで使うようにする（メモの方針「0022_テストを軽くする」）。
// npm install のたびに postinstall から呼ぶ。core.hooksPath はリポジトリの設定で、本体とすべてのワークツリーに共有される
// （相対のパスなので、それぞれの作業場所の .githooks/ を読む）。Git の外・.githooks/ のない所では何もしない
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const HOOKS_PATH = ".githooks";
const root = path.join(import.meta.dirname, "..");

const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });

const inside = git("rev-parse", "--is-inside-work-tree");
if (inside.status !== 0 || inside.stdout.trim() !== "true" || !existsSync(path.join(root, HOOKS_PATH))) process.exit(0);

if (git("config", "--local", "--get", "core.hooksPath").stdout.trim() === HOOKS_PATH) process.exit(0);
const r = git("config", "--local", "core.hooksPath", HOOKS_PATH);
if (r.status === 0) console.log(`git のフックを ${HOOKS_PATH}/ にしました（コミット時・push 時にテストなどを流します）`);
else console.warn(`git のフックを設定できませんでした: ${r.stderr.trim()}`);
