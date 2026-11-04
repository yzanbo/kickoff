// 外部のコマンド: 実行・失敗の文・聞かれても待たない環境変数・実行ファイルの探し方（各所で同じ形を書かない）
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { errorMessage } from "@shared/errors";

/** 外部のコマンドを実行して標準出力・標準エラーを返す（Promise 版の execFile。コアは失敗の文をそろえる runCommand を使う） */
export const execFileAsync = promisify(execFile);

/** 例外に付いている標準エラー（前後の空白を除く。なければ空） */
export function stderrOf(e: unknown): string {
  const stderr = (e as { stderr?: unknown } | null)?.stderr;
  return typeof stderr === "string" ? stderr.trim() : "";
}

/** 外部コマンドの失敗。文はコマンドの説明（標準エラー）で、なければ元の例外の文（見つからない・時間切れなど） */
export class CommandError extends Error {
  /** 終了コード（数）、または起動できなかった理由（"ENOENT" など） */
  readonly code: number | string | null;
  readonly stderr: string;

  constructor(cause: unknown) {
    const stderr = stderrOf(cause);
    super(stderr || errorMessage(cause), { cause });
    const code = (cause as { code?: unknown } | null)?.code;
    this.code = typeof code === "number" || typeof code === "string" ? code : null;
    this.stderr = stderr;
  }
}

interface RunOptions {
  cwd?: string;
  timeout?: number;
  env?: NodeJS.ProcessEnv;
  /** 標準出力の上限（既定 20MB） */
  maxBuffer?: number;
  /** 失敗にしない終了コード（git diff --no-index は差があると 1 で終わる） */
  okCodes?: number[];
}

/** コマンドを実行して標準出力を返す。失敗したら CommandError（標準エラーを文にする） */
export async function runCommand(file: string, args: string[], { okCodes = [], maxBuffer = 20 * 1024 * 1024, ...opts }: RunOptions = {}): Promise<string> {
  try {
    const { stdout } = await execFileAsync(file, args, { ...opts, maxBuffer, encoding: "utf8" });
    return stdout;
  } catch (e) {
    const err = e as { code?: unknown; stdout?: unknown };
    if (typeof err.code === "number" && okCodes.includes(err.code) && typeof err.stdout === "string") return err.stdout;
    throw new CommandError(e);
  }
}

/** パスワード・認証などを聞かれても答えられないので、待たずに失敗させる環境（git と gh。gh は中で git も呼ぶ） */
export function nonInteractiveEnv(): NodeJS.ProcessEnv {
  return { ...process.env, GIT_TERMINAL_PROMPT: "0", GH_PROMPT_DISABLED: "1" };
}

/** PATH に加えて探す場所（Finder から起動してログインシェルの PATH を取り込めなかったときの補い。Homebrew と ~/.local/bin） */
export const FALLBACK_BIN_DIRS = ["/opt/homebrew/bin", "/usr/local/bin", path.join(os.homedir(), ".local", "bin")];

/** 実行できるファイルを探すフォルダ（PATH の順 → 補いの場所。重なりは除く） */
export const searchDirs = (pathEnv = process.env.PATH ?? "") => [...new Set([...pathEnv.split(":").filter(Boolean), ...FALLBACK_BIN_DIRS])];

/** 実行できるファイルか（リンクは先をたどる） */
function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/** names のどれかを dirs の順に探す（names の前のものを先に。見つからなければ null） */
export function findExecutable(names: string[], dirs: string[] = searchDirs(), exists: (file: string) => boolean = isExecutable): string | null {
  for (const name of names) {
    for (const dir of dirs) {
      const file = path.join(dir, name);
      if (exists(file)) return file;
    }
  }
  return null;
}
