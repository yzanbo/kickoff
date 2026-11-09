// git の実行（ほかの git/ のモジュールはここを通す）
import { nonInteractiveEnv, runCommand } from "../system/exec.js";

/**
 * git を実行して標準出力をそのまま返す。失敗したら CommandError（git の説明を文にする）。okCodes の終了コードは失敗にしない
 * （git diff --no-index は差があると 1 で終わる）。パスワードなどを聞かれても答えられないので、待たずに失敗させる。env は足す環境変数
 */
export function gitOutput(cwd: string, args: string[], okCodes: number[] = [], timeout = 30_000, env: NodeJS.ProcessEnv = {}): Promise<string> {
  return runCommand("git", args, { cwd, timeout, env: { ...nonInteractiveEnv(), ...env }, okCodes });
}

/** NUL 区切りの出力（-z）を配列にする */
export const nulList = (out: string) => out.split("\0").filter(Boolean);
