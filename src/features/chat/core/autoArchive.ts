import type { Bus } from "@/foundation/core/bus";
import type { Clock } from "@/foundation/core/clock";
import type { ChatStoreDeps } from "@/features/chat/core/stores";

/** 自動のアーカイブを確かめる間隔 */
const CHECK_MS = 60 * 60_000;

/**
 * 完了したチャットの自動のアーカイブ（設定の「完了から N 日たったらアーカイブ」）。
 * 起動したとき・1 時間ごと・設定を変えたときに確かめる。止めるときは返り値を呼ぶ
 */
export function startAutoArchive(store: Pick<ChatStoreDeps, "chats" | "settings">, bus: Bus, clock: Pick<Clock, "setInterval" | "clearInterval">): () => void {
  const check = () => {
    const days = store.settings.get().auto_archive_days;
    if (!days) return;
    const count = store.chats.archiveStale(days);
    if (count > 0) console.log(`[core] 完了から ${days} 日たったチャットを ${count} 件アーカイブしました`);
  };
  check();
  const timer = clock.setInterval(check, CHECK_MS);
  const unsubscribe = bus.subscribe((e) => {
    if (e.type === "settings") check();
  });
  return () => {
    clock.clearInterval(timer);
    unsubscribe();
  };
}
