// Mac の通知（メインプロセスの Notification）。画面を読み込み直しても・Kickoff を終えても通知センターに残り、押すとそのチャットを開く
import { Notification, app, shell } from "electron";
import type { NotifyRequest, NotifyResult } from "@shared/ipc";
import { mainWindow, showMainWindow } from "../app/window.js";
import { sendEvent, type IpcHandlers } from "../ipc/register.js";
import { chatOfNotificationId, ciOfNotificationId, notificationIdOf } from "./notificationIds.js";

/**
 * 押したときの知らせを受けるために参照を持っておく通知の数。参照をなくした通知は通知センターから消えるので、
 * 新しいものから順にこの数だけ残す
 */
const KEEP = 50;

/** 通知の「show」「failed」を待つ上限（どちらも来なくても画面を待たせない） */
const SHOW_TIMEOUT_MS = 5000;

/** 長すぎる文は切る（通知センターでは収まらない） */
const TITLE_MAX = 200;
const BODY_MAX = 500;

/** Mac の「システム設定 → 通知」 */
const NOTIFICATION_SETTINGS_URL = "x-apple.systempreferences:com.apple.Notifications-Settings.extension";

/** 通知（IPC の notifications）。押したら Kickoff を前に出し、チャットのものなら画面にそのチャットを、CI のものならその実行を開かせる */
export function notificationHandlers(): IpcHandlers["notifications"] {
  const live: Notification[] = [];
  const keep = (n: Notification) => {
    live.push(n);
    if (live.length > KEEP) live.shift();
    n.on("click", () => {
      showMainWindow();
      const chat = chatOfNotificationId(n.id);
      if (chat) sendEvent(mainWindow()?.webContents, "notifications", "onOpenChat", chat.projectId, chat.chatId);
      const ci = ciOfNotificationId(n.id);
      if (ci) sendEvent(mainWindow()?.webContents, "notifications", "onOpenCi", ci.projectId, ci.runId);
    });
  };
  // 前回までに出して、まだ通知センターに残っているものも、押したらそのチャットを開けるようにする
  void Notification.getHistory()
    .then((list) => list.slice(-KEEP).forEach(keep))
    .catch(() => undefined);

  return {
    notify: (_e, request) => show(request, keep),
    openSettings: () => shell.openExternal(NOTIFICATION_SETTINGS_URL),
    // Dock のアイコンの赤い数字（Mac。0 で消える）
    setBadge: (_e, count) => void app.setBadgeCount(count),
  };
}

/** 通知を出し、出せたか（Mac の設定で許可していなければ、その理由）を返す */
function show({ title, body, chat, ci }: NotifyRequest, keep: (n: Notification) => void): Promise<NotifyResult> {
  if (!Notification.isSupported()) return Promise.resolve({ ok: false, error: "この環境では通知を使えません" });
  const n = new Notification({ id: notificationIdOf({ chat, ci }), title: title.slice(0, TITLE_MAX), body: body.slice(0, BODY_MAX), silent: false });
  keep(n);
  return new Promise((resolve) => {
    n.once("show", () => resolve({ ok: true }));
    n.once("failed", (_e, error: string) => resolve({ ok: false, error }));
    setTimeout(() => resolve({ ok: true }), SHOW_TIMEOUT_MS);
    n.show();
  });
}
