// 配る版の印鑑の金庫（鍵付きの別のキーチェーン。ふだんは閉まっていて、AI もほかのプログラムも押せない）。
// 開けるのは署名の間だけ（ビルドは開ける前に済ませる）。パスワードはその場で聞き（-p を付けない）、終わったら失敗しても必ず閉める。
// キーチェーンの検索リストには入れない（codesign --keychain で金庫を直に渡す）
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** 金庫と印鑑（Pin シリーズと同じ nexy Release Signing。名前ではなく SHA-1 で選ぶ）。配ったあとは替えない（替えると更新が入らなくなる） */
export const VAULT = {
  keychain: path.join(os.homedir(), "Library", "Keychains", "nexy-release.keychain-db"),
  identity: "F84FBC463E4889FC6FED2DEF2DC27A9310DB57FC",
};

/**
 * 使う金庫。署名の通しの確かめでは、使い捨てのキーチェーンと印鑑を KICKOFF_SIGN_KEYCHAIN・KICKOFF_SIGN_IDENTITY で渡す
 * （片方だけは止める。金庫のキーチェーンに別の印鑑を探しに行かないため）
 */
export function vaultOf(env = process.env) {
  const keychain = env.KICKOFF_SIGN_KEYCHAIN || null;
  const identity = env.KICKOFF_SIGN_IDENTITY || null;
  if (keychain === null && identity === null) return VAULT;
  if (keychain === null || identity === null) throw new Error("KICKOFF_SIGN_KEYCHAIN と KICKOFF_SIGN_IDENTITY は両方そろえて渡してください");
  if (!/^[0-9A-Fa-f]{40}$/.test(identity)) throw new Error(`KICKOFF_SIGN_IDENTITY は印鑑の SHA-1（16 進 40 文字）です（${identity}）`);
  return { keychain: path.resolve(keychain), identity: identity.toUpperCase() };
}

/** 金庫がこの Mac にあるか */
export const vaultExists = (vault) => existsSync(vault.keychain);

/** 金庫がないときの案内（黙って印鑑なしにしない）。adhocHint: 印鑑なしで作る道も案内するか（配る版は印鑑なしにできないので publish は false） */
export const missingVaultMessage = (vault, { adhocHint }) =>
  [
    `配る版の印鑑の金庫が見つかりません（${vault.keychain}）。`,
    ...(adhocHint
      ? [
          "金庫のない Mac で、とりあえず製品版を作るときは、印鑑なしで作ってください: ADHOC=1 npm run install-app",
          "（印鑑なしの版は、入れ替えるたびにマイク・画面収録などの許可を聞き直し、新しい版の知らせも出しません）",
        ]
      : []),
  ].join("\n");

/** 金庫を開けて fn を流し、終わったら（失敗しても）閉める。パスワードは security がこのターミナルで聞く */
export async function withVault(vault, fn) {
  console.log(`金庫を開けます（${vault.keychain}）。金庫のパスワードを入れてください`);
  execFileSync("security", ["unlock-keychain", vault.keychain], { stdio: "inherit" });
  try {
    return await fn();
  } finally {
    try {
      execFileSync("security", ["lock-keychain", vault.keychain], { stdio: "inherit" });
      console.log("金庫を閉めました");
    } catch (e) {
      console.error(`金庫を閉められませんでした。手で閉めてください: security lock-keychain "${vault.keychain}"`, e);
    }
  }
}
