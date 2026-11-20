// git の実行の前の形（gitOutput。使う所は git(cwd).… に替えていく）
import { git } from "./git";

export { nulList } from "./git";

/**
 * git を実行して標準出力をそのまま返す（git(cwd, { timeout }).run の薄い包み）。失敗したら CommandError。okCodes の終了コードは失敗にしない。
 * env は足す環境変数。remote に触る操作（fetch・push・pull・ls-remote）は Kernel.workplace.git を使う（GitHub のアカウントのトークンを足す）
 */
export function gitOutput(cwd: string, args: string[], okCodes: number[] = [], timeout = 30_000, env: NodeJS.ProcessEnv = {}): Promise<string> {
  return git(cwd, { timeout }).run(args, { okCodes, env });
}
