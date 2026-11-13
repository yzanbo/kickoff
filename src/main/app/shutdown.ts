import { app, session } from "electron";
import type { Core } from "../../core/index.js";
import { desktopPlatform, hostPlatform } from "../platform/index.js";
import { stopChildElectronApps } from "./childApps.js";
import { killAllTerminals } from "../terminal/terminals.js";

/**
 * 終了時の片付け（before-quit）: preventDefault → 自分から起動した Electron のアプリ → ターミナル → コアの順に止めて exitKeepingNotifications。
 * 片付けは 5 秒で打ち切る。app.quit() は呼び直さない（ウィンドウだけ閉じてアプリが残る）
 */
export function registerShutdown(core: () => Core | undefined) {
  let closing = false;
  app.on("before-quit", (e) => {
    const coreToClose = core();
    if (!coreToClose) return killAllTerminals();
    e.preventDefault();
    if (closing) return;
    closing = true;
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5000));
    const cleanup = async () => {
      await stopChildElectronApps(3000, hostPlatform, desktopPlatform);
      killAllTerminals();
      await coreToClose.close();
    };
    void Promise.race([cleanup(), timeout])
      .catch((err) => console.error("[main] 終了の片付けに失敗しました", err))
      .finally(() => void exitKeepingNotifications());
  });
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
