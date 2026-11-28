// 手元ビルドを作って、この Mac の /Applications/Kickoff.app（製品版）を入れ替える: npm run install-app（印鑑なしは ADHOC=1 npm run install-app）
// 配る版と同じ ID・同じ金庫の印鑑で署名するので、Mac からも更新の仕組みからも同じアプリに見える（配った版のほうが新しければ知らせが出る）。
// 順番: 実行中のチャットがないか → ビルド → 製品版を終了（片付けを待つ）→ 開発版にも実行中のチャットがないか → 金庫を開けて組み立てと署名 → 金庫を閉める → 入れ替えて開き直す。
// 金庫は AI が動いていない間だけ開けるので、製品版を終了してから開ける。開発アプリ（Kickoff Dev）には触らない。
// macOS のターミナルか開発版のターミナルから流す（製品版の中のチャット・ターミナルからは止める）
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { checkAgentUpdates } from "./check-agent-updates.mjs";
import { assertNoRunningChats } from "./kickoff-status.mjs";
import { bundleIdOf, cdhashOf, PRODUCTION_BUNDLE_ID, resetPrivacyPermissions } from "./mac-privacy.mjs";
import { buildCode, builtApp, packageApp } from "./package-app.mjs";
import { adhocRequested } from "./signing.mjs";
import { missingVaultMessage, vaultExists, vaultOf } from "./vault.mjs";

const target = "/Applications/Kickoff.app";

const isRunning = () => {
  try {
    execFileSync("pgrep", ["-f", `${target}/Contents/MacOS/Kickoff`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 製品版のアプリの中のプロセス（本体のあとに終わる Helper（GPU・ネットワーク・画面）や crashpad も）が残っているか */
const hasBundleProcesses = () => {
  try {
    execFileSync("pgrep", ["-f", `${target}/Contents/`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

// 製品版の Kickoff の中のターミナルから流すと、製品版を終了したときにこのスクリプトも止められ、入れ替えの途中で終わることがある。
// 印のない古い版の Kickoff のターミナル（TERM_PROGRAM だけ）も、どちらか分からないので止める。開発版（Kickoff Dev）のターミナルからは流してよい
const terminalOf = process.env.KICKOFF_TERMINAL_OF ?? (process.env.TERM_PROGRAM === "Kickoff" ? "unknown" : undefined);
if (terminalOf === "production" || terminalOf === "unknown") {
  console.error("製品版の Kickoff の中のターミナルからは実行できません（製品版を終了するとき、このスクリプトも止まるため）。macOS のターミナル（Terminal.app など）で実行してください");
  process.exit(1);
}

// 署名の仕方: 金庫の印鑑（ふだん）か、ADHOC=1 の印鑑なし。金庫がないのに ADHOC=1 がなければ、黙って印鑑なしにせず止める
const adhoc = adhocRequested(process.env.ADHOC);
if (adhoc) {
  console.warn("ADHOC=1: 印鑑なし（仮の署名）の製品版を作ります。入れ替えるたびにアクセシビリティ・画面収録の許可を聞き直し、新しい版の知らせは出ません");
} else if (!vaultExists(vaultOf())) {
  console.error(missingVaultMessage(vaultOf()));
  process.exit(1);
}

await assertNoRunningChats();
buildCode(adhoc ? "adhoc" : "local");
// ビルドの間に始まったチャットがないか、もう一度確かめる
await assertNoRunningChats();

// 入れ替える前のアプリの ID とハッシュ。ID は版によって違うことがあるので、終了の宛先と許可の片付けに前の値を使う
const installed = existsSync(target);
const previousId = installed ? bundleIdOf(target) : null;
const previousHash = installed ? cdhashOf(target) : null;
const wasRunning = isRunning();
if (wasRunning) {
  // ⌘Q と同じ終わり方（before-quit の片付けが走る。片付けは 5 秒で打ち切られる）
  execFileSync("osascript", ["-e", `tell application id "${previousId ?? PRODUCTION_BUNDLE_ID}" to quit`]);
  for (let i = 0; i < 30 && isRunning(); i++) await sleep(500);
  if (isRunning()) {
    console.error("製品版の Kickoff が終了しませんでした。手で終了してから、もう一度実行してください");
    process.exit(1);
  }
  // 本体のあとに終わる Helper も待つ（キャッシュを書いている途中で入れ替えない）
  for (let i = 0; i < 20 && hasBundleProcesses(); i++) await sleep(250);
}

try {
  // 製品版は止まったので、開発版だけをもう一度確かめてから金庫を開ける
  await assertNoRunningChats();
  await packageApp({ signing: adhoc ? "adhoc" : "release", dir: true });
} catch (e) {
  // 組み立て・署名に失敗したら、入れ替えずに前の製品版を開き直す
  if (wasRunning) execFileSync("open", ["-a", target]);
  throw e;
}

// 画面の HTTP キャッシュは、入れ替えたあとの最初の起動でアプリが消す（版が変わったとき。src/features/updates/desktop/）
if (existsSync(target)) rmSync(target, { recursive: true, force: true });
execFileSync("ditto", [builtApp, target]);
execFileSync("codesign", ["--verify", "--deep", "--strict", target]);
console.log(`${target} を入れ替えました${adhoc ? "（印鑑なし）" : ""}`);
// 前の ID の許可の記録を片付ける。印鑑なしの版は許可が中身に結びつくので、中身が変わったら製品版の許可も消して聞き直してもらう
// （印鑑で署名した版は、印鑑と ID で同じアプリと見なされるので消さない）
const staleIds = [...(previousId && previousId !== PRODUCTION_BUNDLE_ID ? [previousId] : []), ...(adhoc && cdhashOf(target) !== previousHash ? [PRODUCTION_BUNDLE_ID] : [])];
if (staleIds.length > 0 && resetPrivacyPermissions(staleIds).length > 0) console.log("アクセシビリティ・画面収録の許可を消しました（次に使うときに macOS が聞き直します）");
if (wasRunning) execFileSync("open", ["-a", target]);

// Claude Code（同梱の SDK）・Codex（入れた CLI）に新しい版が出ていれば 1 行ずつ知らせる（入れ替えは止めない）
const agentNotice = await checkAgentUpdates().catch(() => null);
if (agentNotice) console.log(agentNotice);
