// ビルドして、この Mac の /Applications/Kickoff.app（本番）を入れ替える: npm run install-app
// 本番の Kickoff が動いていれば、実行中のチャットがないことを確かめてから終了してもらい（片付けを待つ）、入れ替えたあと開き直す。
// 開発アプリ（Kickoff Dev）には触らない。macOS のターミナルか開発版のターミナルから流す（製品版の中のチャット・ターミナルからは止める）
import { execFileSync, execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const target = "/Applications/Kickoff.app";
const built = path.join(root, "dist", "mac-arm64", "Kickoff.app");
const bundleId = "dev.zanbo.kickoff";
// 本番の保存先とポート（src/core/appEnv.ts の production と同じ）
const prodDir = path.join(os.homedir(), "Library", "Application Support", "Kickoff");
const prodPort = 4317;

const isRunning = () => {
  try {
    execFileSync("pgrep", ["-f", `${target}/Contents/MacOS/Kickoff`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

/** 本番の Kickoff で、実行中・順番待ちのチャットがあればやめる（終了するとチャットが止まるため） */
async function assertIdle() {
  if (!isRunning()) return;
  const token = readFileSync(path.join(prodDir, "token"), "utf8").trim();
  const res = await fetch(`http://127.0.0.1:${prodPort}/api/status`, { headers: { authorization: `Bearer ${token}` } });
  const { agents } = await res.json();
  if (agents.running + agents.queued > 0) {
    console.error(`本番の Kickoff で実行中のチャットがあります（実行中 ${agents.running}・順番待ち ${agents.queued}）。終わってからもう一度実行してください`);
    process.exit(1);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 製品版の Kickoff の中のターミナルから流すと、製品版を終了したときにこのスクリプトも止められ、入れ替えの途中で終わることがある。
// 印のない古い版の Kickoff のターミナル（TERM_PROGRAM だけ）も、どちらか分からないので止める。開発版（Kickoff Dev）のターミナルからは流してよい
const terminalOf = process.env.KICKOFF_TERMINAL_OF ?? (process.env.TERM_PROGRAM === "Kickoff" ? "unknown" : undefined);
if (terminalOf === "production" || terminalOf === "unknown") {
  console.error("製品版の Kickoff の中のターミナルからは実行できません（製品版を終了するとき、このスクリプトも止まるため）。macOS のターミナル（Terminal.app など）で実行してください");
  process.exit(1);
}

await assertIdle();
execSync("npx electron-vite build", { cwd: root, stdio: "inherit" });
execSync("npx electron-builder --mac --arm64 --dir", { cwd: root, stdio: "inherit" });

// ビルドの間に始まったチャットがないか、もう一度確かめる
await assertIdle();
const wasRunning = isRunning();
if (wasRunning) {
  // ⌘Q と同じ終わり方（before-quit の片付けが走る。片付けは 5 秒で打ち切られる）
  execFileSync("osascript", ["-e", `tell application id "${bundleId}" to quit`]);
  for (let i = 0; i < 30 && isRunning(); i++) await sleep(500);
  if (isRunning()) {
    console.error("本番の Kickoff が終了しませんでした。手で終了してから、もう一度実行してください");
    process.exit(1);
  }
}

if (existsSync(target)) rmSync(target, { recursive: true, force: true });
execFileSync("ditto", [built, target]);
execFileSync("codesign", ["--verify", "--deep", "--strict", target]);
console.log(`${target} を入れ替えました`);
if (wasRunning) execFileSync("open", ["-a", target]);
