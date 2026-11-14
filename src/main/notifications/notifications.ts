// Mac の通知（メインプロセスの Notification）。画面を読み込み直しても・Kickoff を終えても通知センターに残り、押すとそのチャットを開く
import { Notification, app, shell } from "electron";
import type { NotifyRequest, NotifyResult } from "@shared/ipc";
import type { Notice } from "../../core/notifications/notices.js";
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

/** 押したときの知らせを受けるために参照を持っている通知（新しいものから KEEP 件） */
const live: Notification[] = [];

/** 押したら Kickoff を前に出し、チャットのものなら画面にそのチャットを、CI のものならその実行を開かせる */
function keep(n: Notification) {
  live.push(n);
  if (live.length > KEEP) live.shift();
  n.on("click", () => {
    const chat = chatOfNotificationId(n.id);
    const ci = ciOfNotificationId(n.id);
    // 窓がなければ（閉じた・ログイン時に窓を出さずに起動した）、そのチャット・CI のタブの画面で窓を作る（画面はまだ知らせを受けられない）
    const hash = chat ? `#/projects/${chat.projectId}/chats/${chat.chatId}` : ci ? `#/projects/${ci.projectId}/ci` : "";
    if (!showMainWindow(hash)) return;
    if (chat) sendEvent(mainWindow()?.webContents, "notifications", "onOpenChat", chat.projectId, chat.chatId);
    if (ci) sendEvent(mainWindow()?.webContents, "notifications", "onOpenCi", ci.projectId, ci.runId);
  });
}

/**
 * コアが決めた通知（チャットの完了・失敗・回答待ち・CI の失敗。出すか = だれも見ていないか・設定は、コアの notifications/center.ts が決める）を
 * Mac の通知で出す。startCore({ notify }) で渡す
 */
export function notifyFromCore(notice: Notice): void {
  const target = notice.target.kind === "chat" ? { chat: { projectId: notice.target.project_id, chatId: notice.target.chat_id } } : { ci: { projectId: notice.target.project_id, runId: notice.target.run_id } };
  void show({ title: notice.title, body: notice.body, ...target });
}

/** 通知（IPC の notifications。設定の「テスト通知を送る」・Mac の通知の設定・Dock の数） */
export function notificationHandlers(): IpcHandlers["notifications"] {
  // 前回までに出して、まだ通知センターに残っているものも、押したらそのチャットを開けるようにする
  void Notification.getHistory()
    .then((list) => list.slice(-KEEP).forEach(keep))
    .catch(() => undefined);

  return {
    notify: (_e, request) => show(request),
    openSettings: () => shell.openExternal(NOTIFICATION_SETTINGS_URL),
    // Dock のアイコンの赤い数字（Mac。0 で消える）
    setBadge: (_e, count) => void app.setBadgeCount(count),
  };
}

/** 通知を出し、出せたか（Mac の設定で許可していなければ、その理由）を返す */
function show({ title, body, chat, ci }: NotifyRequest): Promise<NotifyResult> {
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
