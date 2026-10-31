import { execFileSync } from "node:child_process";

/**
 * Finder から起動した macOS アプリはログインシェルの PATH を引き継がない。
 * エージェントが git / npm / gh などを使えるよう、ログインシェルから PATH を取り込む。
 */
export function loadLoginShellPath(): void {
  if (process.platform === "win32") return;
  const shell = process.env.SHELL || "/bin/zsh";
  try {
    const marker = "__KICKOFF_PATH__";
    const out = execFileSync(shell, ["-ilc", `printf '${marker}%s${marker}' "$PATH"`], {
      encoding: "utf8",
      timeout: 10_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const match = out.match(new RegExp(`${marker}(.*)${marker}`));
    if (match?.[1]) {
      const merged = new Set([...match[1].split(":"), ...(process.env.PATH ?? "").split(":")]);
      process.env.PATH = [...merged].filter(Boolean).join(":");
    }
  } catch {
    // 取得できなくても致命的ではない（よく使う場所だけ補う）
    const fallback = ["/opt/homebrew/bin", "/usr/local/bin", `${process.env.HOME}/.local/bin`];
    process.env.PATH = [...new Set([...(process.env.PATH ?? "").split(":"), ...fallback])].filter(Boolean).join(":");
  }
}
