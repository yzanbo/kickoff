import { app, session } from "electron";
import type { CoreProcess } from "./coreProcess.js";
import { desktopPlatform, hostPlatform } from "../platform/index.js";
import { stopChildElectronApps } from "./childApps.js";

/** 片付けの上限（この中にコアの終わりも収める） */
const SHUTDOWN_MS = 5000;
/** コアに残す最後の余り（終わりを待ち切れなければ SIGTERM を送って先へ進む） */
const CORE_CLOSE_MARGIN_MS = 300;

/**
 * 終了時の片付け（before-quit）: preventDefault → 自分から起動した Electron のアプリ → コアのプロセス（close を頼み、終わるのを待つ。
 * ターミナルのシェル・DB も）の順に止めて exitKeepingNotifications。片付けは 5 秒で打ち切る。app.quit() は呼び直さない（ウィンドウだけ閉じてアプリが残る）。
 * reallyExit はメインの後片付けを飛ばすので、コアは必ず先に終わらせる（メインが先に消えると、コアは片付けの途中で止まる）
 */
export function registerShutdown(core: () => CoreProcess | undefined) {
  let closing = false;
  app.on("before-quit", (e) => {
    const coreToClose = core();
    // コアがなければ止めるもの（シェルもコアの子）がない
    if (!coreToClose) return;
    e.preventDefault();
    if (closing) return;
    closing = true;
    const deadline = Date.now() + SHUTDOWN_MS;
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_MS));
    const cleanup = async () => {
      await stopChildElectronApps(3000, hostPlatform, desktopPlatform);
      // ターミナルのシェルもコアが止める（core.close）。残りの時間で終わらなければ SIGTERM
      await coreToClose.close(Math.max(500, deadline - Date.now() - CORE_CLOSE_MARGIN_MS));
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
