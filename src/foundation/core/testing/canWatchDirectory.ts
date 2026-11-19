// OS のディレクトリ監視を必要とするテスト用。Codex の macOS 砂場で FSEvents が拒否されたときだけ skip する。
// 試しの変更は、知らせが来るまで書き直す（macOS の FSEvents は見張りを始めた直後の変更を取りこぼすことがあり、
// 1 回だけ書くと、負荷のかかった全体のテストで知らせが来ないまま失敗した）。本当に見張れなければ 3 秒で失敗にする。
// recursive は、試す側の見張り（ノートのフォルダは中のフォルダまで見張る）と同じ見張り方で試すため
import fs from "node:fs";
import path from "node:path";
import { tempDir } from "./tempDir";

export async function canWatchDirectory({ recursive = false }: { recursive?: boolean } = {}): Promise<boolean> {
  // FSEvents は実際のパスで知らせるので、/tmp ではなく実際のパス（/private/tmp）を見張る
  const dir = tempDir({ real: true });
  return new Promise((resolve, reject) => {
    let watcher: fs.FSWatcher;
    try {
      watcher = fs.watch(dir, { recursive });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EMFILE") resolve(false);
      else reject(error);
      return;
    }
    let count = 0;
    const probe = () => fs.writeFileSync(path.join(dir, "watch-probe"), `probe ${++count}`);
    const retry = setInterval(probe, 100);
    const stop = () => {
      clearTimeout(timer);
      clearInterval(retry);
      watcher.close();
    };
    const timer = setTimeout(() => {
      stop();
      reject(new Error("ディレクトリ監視の試しの変更が通知されませんでした"));
    }, 3_000);
    watcher.once("error", (error: NodeJS.ErrnoException) => {
      stop();
      if (error.code === "EMFILE") resolve(false);
      else reject(error);
    });
    watcher.once("change", () => {
      stop();
      resolve(true);
    });
    probe();
  });
}
