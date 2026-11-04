// Mac の通知（メインプロセスの Notification）。画面を読み込み直しても・Kickoff を終えても通知センターに残り、押すとそのチャットを開く
import { app, ipcMain, Notification, shell, type BrowserWindow } from "electron";
import { notificationIdOf, notifyArgs, runOfNotificationId, type NotifyArgs } from "../ipc/ipcArgs.js";

/** 通知を出した結果（届かなかったら理由。Mac の設定で許可していないときなど） */
export interface NotifyResult {
  ok: boolean;
  error?: string;
}

/**
 * 押したときの知らせを受けるために参照を持っておく通知の数。参照をなくした通知は通知センターから消えるので、
 * 新しいものから順にこの数だけ残す
 */
const KEEP = 50;

/** 通知の「show」「failed」を待つ上限（どちらも来なくても画面を待たせない） */
const SHOW_TIMEOUT_MS = 5000;

/** Mac の「システム設定 → 通知」 */
const NOTIFICATION_SETTINGS_URL = "x-apple.systempreferences:com.apple.Notifications-Settings.extension";

/** 通知の IPC（出す・Mac の通知の設定を開く）。押したら Kickoff を前に出し、チャットのものなら画面にそのチャットを開かせる */
export function registerNotifications(mainWindow: () => BrowserWindow | undefined) {
  const live: Notification[] = [];
  const focus = () => {
    const win = mainWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    app.focus({ steal: true });
  };
  const keep = (n: Notification) => {
    live.push(n);
    if (live.length > KEEP) live.shift();
    n.on("click", () => {
      focus();
      const run = runOfNotificationId(n.id);
      if (run) mainWindow()?.webContents.send("kickoff:open-run", run.projectId, run.runId);
    });
  };
  // 前回までに出して、まだ通知センターに残っているものも、押したらそのチャットを開けるようにする
  void Notification.getHistory()
    .then((list) => list.slice(-KEEP).forEach(keep))
    .catch(() => undefined);

  ipcMain.handle("kickoff:notify", (_e, raw: unknown) => show(notifyArgs(raw), keep));
  ipcMain.handle("kickoff:open-notification-settings", () => shell.openExternal(NOTIFICATION_SETTINGS_URL));
}

/** 通知を出し、出せたか（Mac の設定で許可していなければ、その理由）を返す */
function show({ title, body, run }: NotifyArgs, keep: (n: Notification) => void): Promise<NotifyResult> {
  if (!Notification.isSupported()) return Promise.resolve({ ok: false, error: "この環境では通知を使えません" });
  const n = new Notification({ id: notificationIdOf(run), title, body, silent: false });
  keep(n);
  return new Promise((resolve) => {
    n.once("show", () => resolve({ ok: true }));
    n.once("failed", (_e, error: string) => resolve({ ok: false, error }));
    setTimeout(() => resolve({ ok: true }), SHOW_TIMEOUT_MS);
    n.show();
  });
}
