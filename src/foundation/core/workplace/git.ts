// git の実行の口（作業場所の git はここを通す）。手元だけの操作は git(cwd)、remote に触る操作は Kernel.workplace.git(cwd)（登録された環境変数を足す）
import { nonInteractiveEnv, runCommand } from "@/foundation/core/system/exec";

export interface GitRunOptions {
  /** 失敗にしない終了コード（git diff --no-index は差があると 1 で終わる） */
  okCodes?: number[];
  /** 既定は git(cwd, { timeout }) の値 */
  timeout?: number;
  /** 足す環境変数 */
  env?: NodeJS.ProcessEnv;
}

export interface Git {
  /** 標準出力をそのまま返す（失敗は CommandError。git の説明を文にする） */
  run(args: string[], opts?: GitRunOptions): Promise<string>;
  /** 成否だけ */
  ok(args: string[]): Promise<boolean>;
  /** 前後の空白を除いた出力 */
  text(args: string[]): Promise<string>;
  /** 失敗なら空 */
  maybe(args: string[]): Promise<string>;
  /** 空行を除いた行 */
  lines(args: string[]): Promise<string[]>;
  /** NUL 区切りの出力（-z）を配列にする */
  nul(args: string[]): Promise<string[]>;
}

export interface GitOptions {
  /** 既定 30 秒 */
  timeout?: number;
  /** 足す環境変数の出どころ（Kernel.workplace.git が登録された分を渡す） */
  env?: () => Promise<NodeJS.ProcessEnv>;
}

/** NUL 区切りの出力（-z）を配列にする */
export const nulList = (out: string) => out.split("\0").filter(Boolean);

/** 空行を除いた行 */
const lineList = (out: string) => out.split("\n").filter(Boolean);

/**
 * cwd で git を動かす口。パスワードなどを聞かれても答えられないので、待たずに失敗させる（GIT_TERMINAL_PROMPT=0・GH_PROMPT_DISABLED=1）。
 * 足す環境変数はない（remote に触る操作は Kernel.workplace.git を使う）
 */
export function git(cwd: string, { timeout = 30_000, env: source }: GitOptions = {}): Git {
  const run = async (args: string[], opts: GitRunOptions = {}) =>
    runCommand("git", args, { cwd, timeout: opts.timeout ?? timeout, env: { ...nonInteractiveEnv(), ...(source ? await source() : {}), ...opts.env }, okCodes: opts.okCodes ?? [] });
  return {
    run,
    ok: (args) =>
      run(args).then(
        () => true,
        () => false,
      ),
    text: async (args) => (await run(args)).trim(),
    maybe: (args) => run(args).catch(() => ""),
    lines: async (args) => lineList(await run(args)),
    nul: async (args) => nulList(await run(args)),
  };
}
