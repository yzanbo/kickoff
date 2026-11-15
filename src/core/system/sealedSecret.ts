// 秘密の値の暗号化（キーチェーンの鍵 = Electron の safeStorage）。DB のパスワードと AI の API キーで同じ置き方にする。
// 暗号化の口はメインプロセスが startCore に渡す（コアは Electron に依らない）。口のない単体のコア・テストは暗号化せずに置く（予備）
import { errorMessage } from "@shared/errors";
import { Invalid } from "../http/errors.js";

/** 暗号化と復号（Electron の safeStorage の非同期の口。キーチェーンの許可を待つ間もメインプロセスを止めない） */
export interface SecretCipher {
  /** 暗号化した値（base64） */
  encrypt(plain: string): Promise<string>;
  /** 暗号化した値（base64）から元の値。キーチェーンで拒否されたら失敗 */
  decrypt(sealed: string): Promise<string>;
}

/** 暗号化した値の頭の印（印のない値は、暗号化せずに置いたもの） */
export const SEALED = "safe:v1:";

/** 置く前に暗号化する（口がなければそのまま。暗号化できなければ 400） */
export async function sealSecret(cipher: SecretCipher | null, plain: string, what: string): Promise<string> {
  if (!cipher) return plain;
  try {
    return SEALED + (await cipher.encrypt(plain));
  } catch (error) {
    throw new Invalid(`${what}を暗号化できませんでした（${errorMessage(error)}）`);
  }
}

/** 置いた値を開く（印のない値はそのまま。開けなければ失敗） */
export function openSecret(cipher: SecretCipher | null, stored: string): Promise<string> {
  if (!stored.startsWith(SEALED)) return Promise.resolve(stored);
  return cipher ? cipher.decrypt(stored.slice(SEALED.length)) : Promise.reject(new Error("暗号化の口がありません"));
}
