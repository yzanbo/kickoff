import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitHubStatus } from "./types.js";

const execFileAsync = promisify(execFile);

/** gh CLI のインストール・ログイン状態（push と PR 作成に使う） */
export async function githubStatus(): Promise<GitHubStatus> {
  try {
    await execFileAsync("gh", ["--version"], { timeout: 10_000 });
  } catch {
    return { installed: false, loggedIn: false, detail: "gh が見つかりません。`brew install gh` でインストールしてください" };
  }
  try {
    const { stdout } = await execFileAsync("gh", ["api", "user", "--jq", ".login"], { timeout: 20_000 });
    const account = stdout.trim();
    return { installed: true, loggedIn: true, account, detail: `${account} でログイン済み` };
  } catch {
    return { installed: true, loggedIn: false, detail: "未ログインです。ターミナルで `gh auth login` を実行してください" };
  }
}
