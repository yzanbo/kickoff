// 製品版を組み立てて署名する手順（npm run install-app と npm run publish が同じ形で使う）。
// 時間のかかる画面とメインのビルド（buildCode）は金庫を開ける前に済ませ、金庫を開けている間は組み立てと署名（packageApp）だけにする
import { execFileSync } from "node:child_process";
import path from "node:path";
import { readBuildStamp } from "./build-stamp.mjs";
import { verifySignature } from "./signing.mjs";
import { vaultOf, withVault } from "./vault.mjs";

export const root = path.join(import.meta.dirname, "..");
/** 組み立てたアプリ（electron-builder の mac-arm64 の出力） */
export const builtApp = path.join(root, "dist", "mac-arm64", "Kickoff.app");

/** 画面・メイン・コアのビルド（kind は版の情報の作り方。scripts/build-stamp.mjs） */
export function buildCode(kind) {
  execFileSync("npx", ["electron-vite", "build"], { cwd: root, stdio: "inherit", env: { ...process.env, KICKOFF_BUILD_KIND: kind } });
}

/**
 * 組み立てて署名する（signing: release = 金庫を開けて印鑑で / adhoc = 仮の署名）。dir: true はアプリだけ（install-app）、false は dmg と zip も（publish）。
 * CFBundleVersion にはビルド番号（コミットの数）を入れる。終わったら署名を確かめ直す（electron-builder が afterPack のあとに触っても気づくように）
 */
export async function packageApp({ signing, dir }) {
  const { buildNumber } = readBuildStamp(root);
  const args = ["electron-builder", "--mac", "--arm64", ...(dir ? ["--dir"] : []), "--publish", "never", ...(buildNumber === null ? [] : [`-c.buildVersion=${buildNumber}`])];
  const run = () => execFileSync("npx", args, { cwd: root, stdio: "inherit", env: { ...process.env, KICKOFF_SIGN: signing } });
  if (signing === "release") {
    const vault = vaultOf();
    await withVault(vault, run);
    verifySignature(builtApp, vault.identity);
  } else {
    run();
    verifySignature(builtApp, null);
  }
}
