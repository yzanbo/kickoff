// コアのプロセスを組み立てる: 起動の値（init）・コアから呼ばれるメインの口（埋め込みブラウザ・キーチェーンの鍵）・コアからの知らせの行き先
// （通知・ブラウザの操作の印・詰まり）・様子の配り先（画面の帯の IPC core.onState）
import path from "node:path";
import { app, BrowserWindow } from "electron";
import type { CoreState } from "@shared/foundation/ipc";
import { agentBrowser, agentBrowserHostMethods } from "@/features/browser/desktop/agentBrowser";
import { recordCoreStall } from "@/foundation/desktop/diagnostics/stalls";
import type { IpcHandlers } from "@/foundation/desktop/ipc/register";
import { sendEvent } from "@/foundation/desktop/ipc/register";
import { notifyFromCore } from "@/foundation/desktop/notifications/notifications";
import { hostPlatform } from "@/foundation/desktop/platform/index";
import { COMPILE_CACHE_ARG } from "@/foundation/core/system/compileCache";
import { prefixedHandlers } from "@/foundation/core/host/protocol";
import { SECRET_METHODS } from "@/foundation/core/system/sealedSecret";
import { prepareCoreCompileCache } from "./compileCache";
import { CoreProcess, type HostHandlers } from "./coreProcess";
import { CORE_FILE, DB_WORKER_FILE, RENDERER_DIR, SPEECH_HELPER } from "./environment";
import { logsDir } from "./logs";
import { safeStorageCipher } from "./secretCipher";
import { startupLog } from "./startupLog";

/** コアから呼ばれるメインの口（埋め込みブラウザの操作と、DB のパスワード・API キーの暗号化） */
const hostHandlers: HostHandlers = { ...agentBrowserHostMethods, ...prefixedHandlers("secret", safeStorageCipher, SECRET_METHODS) };

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
    // コアのコンパイルキャッシュの場所（init は本体を読んだあとに届くので、起動の引数で渡す）
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
