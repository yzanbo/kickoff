import { app } from "electron";
import type { Core } from "../../core/index.js";
import { stopChildElectronApps } from "./childApps.js";
import { killAllTerminals } from "../terminal/terminals.js";

/**
 * 終了時の片付け（before-quit）: preventDefault → 自分から起動した Electron のアプリ → ターミナル → コアの順に止めて app.exit(0)。
 * 片付けは 5 秒で打ち切る。app.quit() は呼び直さない（ウィンドウだけ閉じてアプリが残る）
 */
export function registerShutdown(core: () => Core | undefined) {
  let closing = false;
  app.on("before-quit", (e) => {
    const coreToClose = core();
    if (!coreToClose) return killAllTerminals();
    // 実行中のエージェントや DB を閉じてから終了する（片付けの間に届いた終了の指示も待たせる）
    e.preventDefault();
    if (closing) return;
    closing = true;
    // 片付けのあとに app.quit() を呼び直すと、ウィンドウを閉じたところで終了が取り消されてしまうので、app.exit で終える。
    // 片付けが終わらなくても、5 秒で終える
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5000));
    const cleanup = async () => {
      // 内蔵ターミナル・エージェントから起動した Electron のアプリ（開発版の Kickoff Dev など）を、先に正しく止める（3 秒まで）。
      // シェルやエージェントを先に止めると、そのアプリが Helper ごといきなり止められ、localStorage が消えることがある
      await stopChildElectronApps(3000);
      killAllTerminals();
      await coreToClose.close();
    };
    void Promise.race([cleanup(), timeout])
      .catch((err) => console.error("[main] 終了の片付けに失敗しました", err))
      .finally(() => app.exit(0));
  });
}
