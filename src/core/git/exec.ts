// git の実行（ほかの git/ のモジュールはここを通す）
import { execFileAsync } from "../system/exec.js";

/**
 * git を実行して標準出力をそのまま返す。okCodes の終了コードは失敗にしない
 * （git diff --no-index は差があると 1 で終わる）
 */
export async function gitOutput(cwd: string, args: string[], okCodes: number[] = [], timeout = 30_000): Promise<string> {
  try {
    // パスワードなどを聞かれても答えられないので、待たずに失敗させる
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      timeout,
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return stdout;
  } catch (e) {
    const err = e as { code?: unknown; stdout?: unknown; stderr?: unknown };
    if (typeof err.code === "number" && okCodes.includes(err.code) && typeof err.stdout === "string") return err.stdout;
    // git の説明（stderr）があれば、それを失敗の文にする
    const detail = typeof err.stderr === "string" ? err.stderr.trim() : "";
    throw detail ? new Error(detail) : e;
  }
}

/** NUL 区切りの出力（-z）を配列にする */
export const nulList = (out: string) => out.split("\0").filter(Boolean);
