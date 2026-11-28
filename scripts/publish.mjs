// 配る: npm run publish（利用者が macOS のターミナルで流す。AI は流さない = 守りの門が断る）。
// 確かめ（コミット済み・タグ・版・実行中のチャット）→ ビルド → 金庫を開けて dmg と zip を作って署名 → 金庫を閉める → 署名・fuses の確かめ →
// タグ v<版> → Releases（β 版はプレリリース）→ 版の一覧 latest-mac.yml を GitHub Pages の置き場所へ。
// 版の一覧は最後に置く（先に置くと、本体がまだない版を使う人の Kickoff が取りに行くため）。配る版は必ず金庫の印鑑（ADHOC は見ない）
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";
import distribution from "../src/shared/updates/distribution.json" with { type: "json" };
import { assertNoRunningChats } from "./kickoff-status.mjs";
import { buildCode, builtApp, packageApp, root } from "./package-app.mjs";
import { dirtyProblem, fusesProblem, isPrerelease, releaseTagOf, rewriteLatestMac } from "./release.mjs";
import { missingVaultMessage, vaultExists, vaultOf } from "./vault.mjs";

const dist = path.join(root, "dist");
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, encoding: "utf8", ...opts }).trim();
const ok = (cmd, args) => spawnSync(cmd, args, { cwd: root, stdio: "ignore" }).status === 0;
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

// 製品版の Kickoff の中のターミナル・チャットから流さない（AI が動く場所で金庫を開けない）
if (process.env.KICKOFF_TERMINAL_OF || process.env.TERM_PROGRAM === "Kickoff") fail("Kickoff の中のターミナルからは配れません。macOS のターミナル（Terminal.app など）で実行してください");

// 1. 確かめ
const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const tag = releaseTagOf(version);
const repo = distribution.repo;
const builderYml = parse(readFileSync(path.join(root, "electron-builder.yml"), "utf8"));
if (builderYml.publish?.url !== distribution.feedUrl) fail(`electron-builder.yml の publish.url（${builderYml.publish?.url}）が配る場所（${distribution.feedUrl}）と違います`);
const dirty = dirtyProblem(run("git", ["status", "--porcelain"]));
if (dirty) fail(dirty);
if (ok("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`])) fail(`タグ ${tag} はもうあります。package.json の version を上げてください`);
if (!ok("gh", ["auth", "status"])) fail("gh にログインしていません（gh auth login）");
if (!ok("gh", ["repo", "view", repo])) fail(`配る先のリポジトリ ${repo} が見つかりません（src/shared/updates/distribution.json）`);
if (ok("gh", ["release", "view", tag, "--repo", repo])) fail(`${repo} に ${tag} の Releases がもうあります`);
// タグを送る先（配る先のリポジトリを指す remote）
const remote = run("git", ["remote"]).split("\n").find((name) => run("git", ["remote", "get-url", name]).includes(repo));
if (!remote) fail(`${repo} を指す remote がありません（git remote add で足してから配ってください）`);
const notesFile = path.join(root, "release-notes", `${version}.md`);
if (!existsSync(notesFile)) fail(`リリースの説明 ${path.relative(root, notesFile)} がありません（書いてコミットしてから配ってください）`);
const vault = vaultOf();
if (!vaultExists(vault)) fail(missingVaultMessage(vault).split("\n")[0]);
await assertNoRunningChats();

// 2. ビルド（金庫はまだ開けない）。前の版の dmg・zip を混ぜないよう dist を空にする
rmSync(dist, { recursive: true, force: true });
buildCode("release");
await assertNoRunningChats();

// 3. 金庫を開けて dmg と zip を作って署名し、閉める（失敗しても閉める）。署名の印鑑の指紋と Hardened Runtime は packageApp が確かめる
await packageApp({ signing: "release", dir: false });

// 4. 確かめ: fuses・入れ子も厳しく（packageApp で済ませた署名の確かめに足す）
const fuses = fusesProblem(run("node", [path.join(root, "node_modules", "@electron", "fuses", "dist", "bin.js"), "read", "--app", builtApp]));
if (fuses) fail(fuses);
const files = readdirSync(dist).filter((f) => /\.(dmg|zip|blockmap)$/.test(f)).map((f) => path.join(dist, f));
if (!files.some((f) => f.endsWith(".dmg")) || !files.some((f) => f.endsWith(".zip"))) fail("dmg と zip ができていません");

// 5. 版の一覧の zip・dmg の場所を Releases の URL に書き換える
const latest = path.join(dist, "latest-mac.yml");
writeFileSync(latest, rewriteLatestMac(readFileSync(latest, "utf8"), { repo, tag }));

// 6. タグ → Releases（β 版はプレリリース。説明の後ろに、本物の置き場所と初めて開くときの手順を足す）
run("git", ["tag", "-a", tag, "-m", `Kickoff ${version}`], { stdio: "inherit" });
run("git", ["push", remote, tag], { stdio: "inherit" });
const notes = `${readFileSync(notesFile, "utf8").trim()}\n\n---\n本物の Kickoff は https://github.com/${repo}/releases からだけ配っています。\n初めて開くときは、システム設定の「プライバシーとセキュリティ」で［このまま開く］を押してください（2 回目からと、アプリの中の更新では出ません）。\n`;
const notesTmp = path.join(mkdtempSync(path.join(os.tmpdir(), "kickoff-release-")), "notes.md");
writeFileSync(notesTmp, notes);
run("gh", ["release", "create", tag, "--repo", repo, "--verify-tag", "--title", `Kickoff ${version}`, "--notes-file", notesTmp, ...(isPrerelease(version) ? ["--prerelease"] : []), ...files, latest], { stdio: "inherit" });

// 7. 版の一覧を GitHub Pages の置き場所へ（ここで初めて、使う人の Kickoff が新しい版に気づく）
const pages = mkdtempSync(path.join(os.tmpdir(), "kickoff-pages-"));
run("gh", ["repo", "clone", distribution.pagesRepo, pages, "--", "--depth", "1"], { stdio: "inherit" });
mkdirSync(path.join(pages, distribution.pagesDir), { recursive: true });
writeFileSync(path.join(pages, distribution.pagesDir, "latest-mac.yml"), readFileSync(latest, "utf8"));
run("git", ["-C", pages, "add", path.join(distribution.pagesDir, "latest-mac.yml")]);
run("git", ["-C", pages, "commit", "-m", `kickoff: ${version}`], { stdio: "inherit" });
run("git", ["-C", pages, "push"], { stdio: "inherit" });
console.log(`Kickoff ${version} を配りました: https://github.com/${repo}/releases/tag/${tag}`);
