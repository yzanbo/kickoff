// 埋め込みブラウザのメインの部品（src/app/desktop/index.ts が土台へ渡す）: IPC の 4 つのまとまり・コアから呼ばれる browser.*・
// AI が操作したタブの印・窓を作る前の webview の守りとコンソールの見張り・拡張機能の読み込み
import { BROWSER_METHODS } from "@shared/browser/control";
import { prefixedHandlers } from "@/foundation/core/host/protocol";
import { defineDesktopPart } from "@/foundation/desktop/parts";
import { agentBrowser, agentBrowserHandlers } from "./agent";
import { hardenWebviews } from "./browser";
import { browserContextHandlers } from "./contextMenu";
import { devtoolsHandlers } from "./devtools";
import { browserExtensionHandlers, loadSavedExtensions } from "./extensions";
import { watchWebviewConsoles } from "./webviewConsole";

export const browserDesktop = defineDesktopPart({
  name: "browser",
  ipc: { browser: browserContextHandlers, devtools: devtoolsHandlers, agentBrowser: agentBrowserHandlers, browserExtensions: browserExtensionHandlers },
  // コアのプロセスから呼ばれる口（RPC の "browser.<名前>"。AI が操作した印 touch はコアからの知らせで受ける）
  hostMethods: prefixedHandlers("browser", agentBrowser, BROWSER_METHODS),
  start() {
    // 埋め込みブラウザの安全設定は、ウィンドウを作る前に登録しておく
    hardenWebviews();
    // AI が読む埋め込みブラウザのコンソールの出力は、webview ができたときから覚える
    watchWebviewConsoles();
  },
  connectCore(core) {
    // AI が操作したタブの印（画面の「AI 操作中」）
    core.on("browser.touch", (tabId) => agentBrowser.touch(tabId));
  },
  ready() {
    // 埋め込みブラウザの拡張機能（React DevTools など）を読み込む
    void loadSavedExtensions().then((errors) => errors.forEach((e) => console.warn("[browser] 拡張機能を読み込めません:", e)));
  },
});
