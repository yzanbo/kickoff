// コアのプロセスを組み立てる: 起動の値（init）・コアから呼ばれるメインの口（埋め込みブラウザ・キーチェーンの鍵）・コアからの知らせの行き先
// （通知・ブラウザの操作の印・詰まり）・様子の配り先（画面の帯の IPC core.onState）。メモの仕様書「0023_表示を軽くする」の案 16（分冊 4 の 1-3・1-4）
import path from "node:path";
import { app, BrowserWindow } from "electron";
import type { CoreState } from "@shared/ipc";
import { agentBrowser } from "../browser/agentBrowser.js";
import { recordCoreStall } from "../diagnostics/stalls.js";
import type { IpcHandlers } from "../ipc/register.js";
import { sendEvent } from "../ipc/register.js";
import { notifyFromCore } from "../notifications/notifications.js";
import { hostPlatform } from "../platform/index.js";
import { COMPILE_CACHE_ARG } from "../../core/system/compileCache.js";
import { prepareCoreCompileCache } from "./compileCache.js";
import { CoreProcess, type HostHandlers } from "./coreProcess.js";
import { CORE_FILE, DB_WORKER_FILE, RENDERER_DIR, SPEECH_HELPER } from "./environment.js";
import { logsDir } from "./logs.js";
import { safeStorageCipher } from "./secretCipher.js";
import { startupLog } from "./startupLog.js";

/** コアから呼ばれるメインの口（埋め込みブラウザの操作と、DB のパスワード・API キーの暗号化） */
const hostHandlers: HostHandlers = {
  "browser.tabs": () => agentBrowser.tabs(),
  "browser.open": (projectId, url, reveal) => agentBrowser.open(projectId, url, reveal),
  "browser.reveal": (tabId, request) => agentBrowser.reveal(tabId, request),
  "browser.navigate": (tabId, url) => agentBrowser.navigate(tabId, url),
  "browser.history": (tabId, action) => agentBrowser.history(tabId, action),
  "browser.read": (tabId) => agentBrowser.read(tabId),
  "browser.screenshot": (tabId) => agentBrowser.screenshot(tabId),
  "browser.click": (tabId, ref) => agentBrowser.click(tabId, ref),
  "browser.type": (tabId, ref, text, submit) => agentBrowser.type(tabId, ref, text, submit),
  "browser.press": (tabId, key) => agentBrowser.press(tabId, key),
  "browser.scroll": (tabId, direction) => agentBrowser.scroll(tabId, direction),
  "browser.evaluate": (tabId, script) => agentBrowser.evaluate(tabId, script),
  "browser.consoleLogs": (tabId) => agentBrowser.consoleLogs(tabId),
  "secret.encrypt": (plain) => safeStorageCipher.encrypt(plain),
  "secret.decrypt": (sealed) => safeStorageCipher.decrypt(sealed),
};

/** 開いている画面（メインの窓・別ウィンドウ）すべてに、コアの様子を知らせる */
function broadcastState(state: CoreState) {
  for (const win of BrowserWindow.getAllWindows()) sendEvent(win.webContents, "core", "onState", { state });
}

/** コアのプロセスの起動の引数（コンパイルキャッシュの場所。保存先の compile-cache の下の、いまの版・ビルドのフォルダ） */
function coreCacheArgs(): string[] {
  const dir = prepareCoreCompileCache({ userData: app.getPath("userData"), chunksDir: path.join(path.dirname(CORE_FILE), "chunks"), appVersion: app.getVersion() });
  return [`${COMPILE_CACHE_ARG}${dir}`];
}

/** コアのプロセスを作る（まだ起動しない。start で fork する） */
export function createCoreProcess(opts: { port: number; devUrl: string | undefined }): CoreProcess {
  const core = new CoreProcess({
    file: CORE_FILE,
    // コアのコンパイルキャッシュの場所（init は本体を読んだあとに届くので、起動の引数で渡す。案 24）
    args: coreCacheArgs(),
    dbWorkerFile: DB_WORKER_FILE,
    init: (recoveredReason) => ({
      dataDir: app.getPath("userData"),
      port: opts.port,
      // 開発時は electron-vite の dev サーバーが画面を配り、製品版はコアが配る
      staticDir: opts.devUrl ? null : RENDERER_DIR,
      // 内蔵ターミナルのシェルに、どちらの Kickoff のターミナルかを渡す（npm run install-app が、製品版のターミナルから流されたのを見分ける）
      terminalEnv: { KICKOFF_TERMINAL_OF: app.isPackaged ? "production" : "development" },
      speechHelper: SPEECH_HELPER,
      hostPid: process.pid,
      logsDir: logsDir(),
      hostStartedAt: performance.timeOrigin,
      recoveredReason,
    }),
    handlers: hostHandlers,
    onState: (state) => {
      startupLog(`コアの様子: ${state}`);
      broadcastState(state);
    },
    log: startupLog,
    processTable: () => hostPlatform.processTable(),
  });
  // 通知を出すかはコアが決め、Mac の通知はここで出す（notifications/notifications.ts）
  core.on("notify", notifyFromCore);
  // AI が操作したタブの印（画面の「AI 操作中」）
  core.on("browser.touch", (tabId) => agentBrowser.touch(tabId));
  core.on("stall", recordCoreStall);
  return core;
}

/** 画面の上の帯の操作（IPC の core） */
export function coreIpcHandlers(core: CoreProcess): IpcHandlers["core"] {
  return {
    state: () => ({ state: core.state }),
    restart: () => core.restart(),
    wait: () => core.wait(),
  };
}
