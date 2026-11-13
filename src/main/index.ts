// Electron のメインプロセスの入口。起動の順番だけを書く（中身は app/ ipc/ browser/ terminal/ notifications/ diagnostics/）
import { app, BrowserWindow, dialog } from "electron";
import { errorMessage } from "@shared/errors";
import { startCore, type Core } from "../core/index.js";
import { macosPlatform } from "../core/platform/macos/index.js";
import { setAppMenu } from "./app/appMenu.js";
import { utilityWorker } from "./app/dbWorker.js";
import { safeStorageCipher } from "./app/secretCipher.js";
import { prepareAppSession } from "./app/appSession.js";
import { DB_WORKER_FILE, RENDERER_DIR, SPEECH_HELPER, seedDevDataOnce, setupEnvironment } from "./app/environment.js";
import { registerShutdown } from "./app/shutdown.js";
import { logLaunch, startupLog, watchChildProcesses } from "./app/startupLog.js";
import { openMainWindow, showMainWindow } from "./app/window.js";
import { agentBrowser } from "./browser/agentBrowser.js";
import { hardenWebviews } from "./browser/browser.js";
import { loadSavedExtensions } from "./browser/extensions.js";
import { watchWebviewConsoles } from "./browser/webviewConsole.js";
import { moveLegacyDiagnostics } from "./diagnostics/diagnostics.js";
import { setDiagnosticsCore } from "./diagnostics/mainProcess.js";
import { registerIpc } from "./ipc/ipc.js";
import { agentTerminals, setTerminalEnvOf } from "./terminal/terminals.js";

// 1. 名前・保存先を決め、起動の記録を始める（~/Library/Logs/<アプリ名>/startup.log。入れ替えた直後だけ画面が出ないことの原因を追うため）
const { port, devUrl } = setupEnvironment();
logLaunch();
watchChildProcesses();
// 2. 開発のデータがまだなければ、本番のデータから一度だけ写す（起動中の印を作る前に）
seedDevDataOnce();
// 3. 埋め込みブラウザの安全設定は、ウィンドウを作る前に登録しておく
hardenWebviews();
// AI が読む埋め込みブラウザのコンソールの出力は、webview ができたときから覚える
watchWebviewConsoles();

let core: Core | undefined;

// 4. 1 つだけ起動する（2 つ目は、いまのウィンドウを前に出して終わる）
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showMainWindow);
  app.whenReady().then(start);
}

/** 準備ができたら: コア（DB・エージェント・HTTP API）→ 画面のセッション → IPC・メニュー → ウィンドウ */
async function start() {
  startupLog("whenReady");
  // OS ごとに違う処理の口（いまは macOS だけ。音声認識の補助コマンドの場所も渡す）
  const platform = macosPlatform({ speechHelper: SPEECH_HELPER });
  platform.loadLoginShellPath();
  startupLog("ログインシェルの PATH を読みました");
  void moveLegacyDiagnostics();
  try {
    // 開発時は electron-vite の dev サーバーが画面を配り、本番はコアが配る
    // AI には埋め込みブラウザの操作も渡す（browser/agentBrowser.ts）
    core = await startCore({
      dataDir: app.getPath("userData"),
      port,
      staticDir: devUrl ? undefined : RENDERER_DIR,
      browser: agentBrowser,
      // 内蔵ターミナルの出力も AI に読ませる（読むだけ。terminal/terminals.ts）
      terminals: agentTerminals,
      platform,
      // DB ワーカーは utilityProcess で起動する（製品版は fuses で ELECTRON_RUN_AS_NODE を切るため。app/dbWorker.ts）
      dbWorker: () => utilityWorker(DB_WORKER_FILE),
      // DB のパスワードはキーチェーンの鍵（safeStorage）で暗号化して置く（app/secretCipher.ts）
      secretCipher: safeStorageCipher,
    });
    setDiagnosticsCore(core);
    // ワークツリーのターミナルには、その帯の開発サーバーの番号（PORT）を渡す
    setTerminalEnvOf((cwd) => core?.worktreeEnvFor(cwd) ?? {});
    startupLog(`コアを起動しました ${core.localUrl}`);
  } catch (e) {
    startupLog(`コアを起動できません: ${errorMessage(e)}`);
    dialog.showErrorBox("Kickoff を起動できません", `コアの起動に失敗しました（ポート ${port}）。\n${errorMessage(e)}`);
    app.quit();
    return;
  }
  const uiUrl = devUrl ?? core.localUrl;
  await prepareAppSession(uiUrl, core.token);
  startupLog("認証の Cookie を設定しました");
  registerIpc(uiUrl);
  setAppMenu();
  openMainWindow(uiUrl);
  // 埋め込みブラウザの拡張機能（React DevTools など）を読み込む
  void loadSavedExtensions().then((errors) => errors.forEach((e) => console.warn("[browser] 拡張機能を読み込めません:", e)));
  // Mac では、ウィンドウを閉じたあとに Dock を押したら作り直す
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) openMainWindow(uiUrl);
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// 5. 終了時の片付け（shutdown.ts。before-quit の流れは変えない）
registerShutdown(() => core);
