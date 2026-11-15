import { app, BrowserWindow, dialog, powerMonitor, session } from "electron";
import type { Core } from "../../core/index.js";
import { desktopPlatform, hostPlatform } from "../platform/index.js";
import { stopChildElectronApps } from "./childApps.js";
import { quitConfirmText } from "./quitConfirm.js";

/**
 * 終了時の片付け（before-quit）: preventDefault → 自分から起動した Electron のアプリ → コア（ターミナルのシェルも）の順に止めて exitKeepingNotifications。
 * 片付けは 5 秒で打ち切る。片付けを始めたあとは app.quit() を呼び直さない（ウィンドウだけ閉じてアプリが残る）。
 * 作業中のチャットがあれば、片付けの前に終了してよいかを聞く（⌘Q・メニュー・Dock・AppleScript の quit。メモの仕様書「0026」の D11）。
 * Mac の終了・再起動・ログアウトと、シグナル（kill -TERM・Ctrl+C）では聞かない（止めた作業は、次に起動したときの再開の確かめで聞く）
 */
export function registerShutdown(core: () => Core | undefined) {
  let closing = false;
  /** 終了してよいかを聞いているところ（続けての ⌘Q では、もう 1 つ出さない） */
  let asking = false;
  /** 聞かずに終える（聞いて「終了する」を選んだ・Mac を終える・シグナル） */
  let skipConfirm = false;
  const quitWithoutAsking = () => {
    skipConfirm = true;
    app.quit();
  };
  // Mac の終了・再起動・ログアウト: 聞くと Mac の終了を止めてしまう
  void app.whenReady().then(() => powerMonitor.on("shutdown", () => (skipConfirm = true)));
  // シグナル（開発版を kill -TERM で止める・ターミナルの Ctrl+C）: 聞く相手がいないので、聞かずに終える
  for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, quitWithoutAsking);

  app.on("before-quit", (e) => {
    const coreToClose = core();
    // コアがなければ止めるもの（シェルもコアの中）がない
    if (!coreToClose) return;
    e.preventDefault();
    if (closing || asking) return;
    const running = skipConfirm ? [] : coreToClose.runningChats();
    if (running.length > 0) {
      asking = true;
      void confirmQuit(running).then((quit) => {
        asking = false;
        if (quit) quitWithoutAsking();
      });
      return;
    }
    closing = true;
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5000));
    const cleanup = async () => {
      await stopChildElectronApps(3000, hostPlatform, desktopPlatform);
      // ターミナルのシェルもコアが止める（core.close）
      await coreToClose.close();
    };
    void Promise.race([cleanup(), timeout])
      .catch((err) => console.error("[main] 終了の片付けに失敗しました", err))
      .finally(() => void exitKeepingNotifications());
  });
}

/** 作業中のチャットがあるときに、終了してよいかを聞く（Return =［終了する］・Esc =［やめる］）。終了するなら true */
async function confirmQuit(chats: { title: string | null }[]): Promise<boolean> {
  const { message, detail } = quitConfirmText(chats);
  const options = { type: "warning" as const, message, detail, buttons: ["終了する", "やめる"], defaultId: 0, cancelId: 1, noLink: true };
  // 前にあるウィンドウのシートにする（なければ、アプリのダイアログ）
  const parent = BrowserWindow.getFocusedWindow();
  const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
  return response === 0;
}

/** 保存を書き出すのを待つ時間（flushStorageData は書き終わりを知らせないため） */
const STORAGE_FLUSH_WAIT_MS = 300;

/**
 * 通知センターの通知を残したまま終わる。
 * app.exit() で普通に終わると、Electron が後片付けで、この起動で出した通知を通知センターから消す
 * （NotificationPresenter を壊すときに、持っている通知をすべて removeDeliveredNotifications する。残す手立ては公開されていない）。
 * そこで、localStorage と Cookie を書き出してから、Electron の後片付けを通らずにプロセスを終える。
 * DB などコアの片付けは、呼ぶ前に済ませておく
 */
async function exitKeepingNotifications() {
  const reallyExit = (process as NodeJS.Process & { reallyExit?: (code: number) => never }).reallyExit;
  if (!reallyExit) return app.exit(0);
  try {
    session.defaultSession.flushStorageData();
    await Promise.race([
      session.defaultSession.cookies.flushStore(),
      new Promise<void>((resolve) => setTimeout(resolve, 1000)),
    ]);
    await new Promise<void>((resolve) => setTimeout(resolve, STORAGE_FLUSH_WAIT_MS));
  } catch (err) {
    console.error("[main] 終了前の保存の書き出しに失敗しました", err);
  }
  reallyExit.call(process, 0);
}
