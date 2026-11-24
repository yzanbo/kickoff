// notifications が window.kickoff を読む所（Mac のアプリの中だけ: Mac の通知・押したときの知らせ・Dock の数）
import type { NotifyRequest, NotifyResult } from "@shared/foundation/ipc";

/** Mac の通知を出せるか（Mac のアプリの中だけ。ブラウザで開いた画面の通知は Web Push を作るまで出さない） */
export const canNotify = () => window.kickoff !== undefined;

/** Mac の通知を出す（テスト通知。Mac のアプリの外なら出せなかった結果） */
export const notify = (request: NotifyRequest): Promise<NotifyResult> => window.kickoff?.notifications.notify(request) ?? Promise.resolve({ ok: false, error: "Mac のアプリの外です" });

/** Mac の「システム設定 → 通知」を開く */
export const openNotificationSettings = () => void window.kickoff?.notifications.openSettings();

/** Dock のアイコンの赤い数字（0 で消える） */
export const setDockBadge = (count: number) => window.kickoff?.notifications.setBadge(count);

/** Mac の通知が押された（チャット・CI の実行）を受ける。やめるときは返り値を呼ぶ */
export function onNotificationClick(handlers: { chat: (projectId: number, chatId: number) => void; ci: (projectId: number, runId: number) => void }): () => void {
  const offChat = window.kickoff?.notifications.onOpenChat(handlers.chat);
  const offCi = window.kickoff?.notifications.onOpenCi(handlers.ci);
  return () => {
    offChat?.();
    offCi?.();
  };
}
