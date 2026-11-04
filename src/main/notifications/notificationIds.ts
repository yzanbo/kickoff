import type { NotificationTarget } from "@shared/ipc";

// 通知の ID（Electron に依らないので、テストできる）

/**
 * 通知の ID（通知センターに残った通知を、アプリを起動し直したあとに押されても、そのチャットを開けるように埋め込む）。
 * 同じ ID を使い回すと、前の通知が消えるときに新しい通知まで消えるので、毎回変える
 */
export function notificationIdOf(chat: NotificationTarget | undefined, now = Date.now()): string {
  return chat ? `kickoff-chat:${chat.projectId}:${chat.chatId}:${now}` : `kickoff:${now}`;
}

/** 通知の ID から、押したときに開くチャットを読み取る（チャットのものでなければ undefined） */
export function chatOfNotificationId(id: string): NotificationTarget | undefined {
  const m = /^kickoff-chat:(\d+):(\d+):/.exec(id);
  return m ? { projectId: Number(m[1]), chatId: Number(m[2]) } : undefined;
}
