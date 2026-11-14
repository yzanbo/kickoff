// macOS の tailscale のコマンドの場所: PATH・Homebrew（brew install tailscale）か、Mac のアプリ（App Store・tailscale.com の配布）の中の実行ファイル
import fs from "node:fs";
import { findExecutable, searchDirs } from "../../system/exec.js";

/** Mac のアプリの中の実行ファイル（引数を付けて呼ぶとコマンドとして動く） */
const APP_CLI = "/Applications/Tailscale.app/Contents/MacOS/Tailscale";

export function macosTailscaleCli(): string | null {
  return findExecutable(["tailscale"], searchDirs()) ?? (fs.existsSync(APP_CLI) ? APP_CLI : null);
}
