import type { Bus } from "../bus.js";
import type { Store } from "../db/store.js";

/** 自動のアーカイブを確かめる間隔 */
const CHECK_MS = 60 * 60_000;

/**
 * 完了したチャットの自動のアーカイブ（設定の「完了から N 日たったらアーカイブ」）。
 * 起動したとき・1 時間ごと・設定を変えたときに確かめる。止めるときは返り値を呼ぶ
 */
export function startAutoArchive(store: Store, bus: Bus): () => void {
  const check = () => {
    const days = store.getSettings().autoArchiveDays;
    if (!days) return;
    const count = store.archiveStaleRuns(days);
    if (count > 0) console.log(`[core] 完了から ${days} 日たったチャットを ${count} 件アーカイブしました`);
  };
  check();
  const timer = setInterval(check, CHECK_MS);
  const unsubscribe = bus.subscribe((e) => {
    if (e.type === "settings") check();
  });
  return () => {
    clearInterval(timer);
    unsubscribe();
  };
}
