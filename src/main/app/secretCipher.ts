// DB のパスワードの暗号化の口（Electron の safeStorage。鍵は macOS のキーチェーンの「<アプリ名> Safe Storage」）をコアに渡す。
// 非同期の口を使う（キーチェーンの許可の画面が出ている間も、メインプロセス（コアの HTTP・画面）を止めない）。
// 鍵は初めて暗号化・復号するときに取りに行く（起動のときに取りに行くと、DB を使わない人も入れ替えのたびに許可を聞かれる）
import { safeStorage } from "electron";
import type { SecretCipher } from "../../core/databases/secrets.js";

async function ensureAvailable() {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) throw new Error("キーチェーンを使えないので、パスワードを暗号化できません");
}

export const safeStorageCipher: SecretCipher = {
  async encrypt(plain) {
    await ensureAvailable();
    return (await safeStorage.encryptStringAsync(plain)).toString("base64");
  },
  async decrypt(sealed) {
    await ensureAvailable();
    return (await safeStorage.decryptStringAsync(Buffer.from(sealed, "base64"))).result;
  },
};
