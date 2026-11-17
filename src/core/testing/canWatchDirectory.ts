// OS のディレクトリ監視を必要とするテスト用。Codex の macOS 砂場で FSEvents が拒否されたときだけ skip する。
import fs from "node:fs";
import path from "node:path";
import { tempDir } from "./tempDir.js";

export async function canWatchDirectory(): Promise<boolean> {
  const dir = tempDir();
  return new Promise((resolve, reject) => {
    let watcher: fs.FSWatcher;
    try {
      watcher = fs.watch(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EMFILE") resolve(false);
      else reject(error);
      return;
    }
    const timer = setTimeout(() => {
      watcher.close();
      reject(new Error("ディレクトリ監視の試しの変更が通知されませんでした"));
    }, 3_000);
    watcher.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      watcher.close();
      if (error.code === "EMFILE") resolve(false);
      else reject(error);
    });
    watcher.once("change", () => {
      clearTimeout(timer);
      watcher.close();
      resolve(true);
    });
    fs.writeFileSync(path.join(dir, "watch-probe"), "probe");
  });
}
