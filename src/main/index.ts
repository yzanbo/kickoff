// Electron のメインプロセスの入口。起動の順番だけを書く（中身は app/ ipc/ browser/ terminal/ notifications/ diagnostics/）
import { app, BrowserWindow, dialog } from "electron";
import { errorMessage } from "@shared/errors";
import { setAppMenu } from "./app/appMenu.js";
import { dropCompileCacheEnv } from "./app/compileCache.js";
import { prepareAppSession } from "./app/appSession.js";
import { coreIpcHandlers, createCoreProcess } from "./app/coreHost.js";
import type { CoreProcess } from "./app/coreProcess.js";
import { seedDevDataOnce, setupEnvironment } from "./app/environment.js";
import { registerShutdown } from "./app/shutdown.js";
import { startKeepAwake } from "./app/keepAwake.js";
import { openedAtLogin } from "./app/loginItem.js";
import { logLaunch, startupLog, watchChildProcesses } from "./app/startupLog.js";
import { allowHangStacks, enableHangStacks, logDisplayEvents } from "./app/hangWatch.js";
import { openMainWindow, setMainWindowUrl, showMainWindow } from "./app/window.js";
import { hardenWebviews } from "./browser/browser.js";
import { loadSavedExtensions } from "./browser/extensions.js";
import { watchWebviewConsoles } from "./browser/webviewConsole.js";
import { setDiagnosticsCore } from "./diagnostics/diagnostics.js";
import { watchMainStalls } from "./diagnostics/stalls.js";
import { markMain, startMetricsLog } from "./diagnostics/bootRecorder.js";
import { registerIpc } from "./ipc/ipc.js";
import { setTerminalCloser } from "./terminal/terminals.js";
import { timed } from "../core/system/stallWatch.js";

// メインのコードを読み終えた時刻（起動の時刻の記録。diagnostics/bootRecorder.ts）
markMain("mainLoaded");
// 1. 名前・保存先を決め、起動の記録を始める（~/Library/Logs/<アプリ名>/startup.log。入れ替えた直後だけ画面が出ないことの原因を追うため）
const { port, devUrl } = setupEnvironment();
logLaunch();
// 環境変数 NODE_COMPILE_CACHE で起動されたら記録に残し、子のプロセスには受け継がせない（メインでは Node が起動の初めに読むので止められない。app/compileCache.ts）
const envCompileCache = dropCompileCacheEnv();
if (envCompileCache) startupLog(`環境変数 NODE_COMPILE_CACHE を付けて起動されました（${envCompileCache}）。コアのプロセスには渡しません`);
// イベントループの詰まりをいつも見張る（~/Library/Logs/<アプリ名>/stalls.jsonl。diagnostics/stalls.ts）
watchMainStalls();
watchChildProcesses();
// 画面が応答しなくなったとき、止まっている JavaScript の場所を取れるようにする（app/hangWatch.ts）
enableHangStacks();
// 2. 開発のデータがまだなければ、本番のデータから一度だけ写す（起動中の印を作る前に）
timed("boot:seedDevData", seedDevDataOnce)();
// 3. 埋め込みブラウザの安全設定は、ウィンドウを作る前に登録しておく
hardenWebviews();
// AI が読む埋め込みブラウザのコンソールの出力は、webview ができたときから覚える
watchWebviewConsoles();

let core: CoreProcess | undefined;

// 4. 1 つだけ起動する（2 つ目は、いまのウィンドウを前に出して終わる）
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // 2 つ目は、いまのウィンドウを前に出して終わる（窓がなければ作る）
  app.on("second-instance", () => showMainWindow());
  app.whenReady().then(start);
}

/**
 * 準備ができたら: コアのプロセスを fork（ログインシェルの PATH・DB・HTTP はコアの中で進む）→ IPC・メニュー → 窓を先に作る
 * → コアの ready を待って画面のセッション → 画面を読み込む（分冊 4 の 1-4）
 */
async function start() {
  markMain("whenReady");
  startupLog("whenReady");
  // 開発時は electron-vite の dev サーバーが画面を配り、製品版はコアが配る（URL はポートから先に分かる）
  const url = devUrl ?? `http://127.0.0.1:${port}`;
  const coreProcess = createCoreProcess({ port, devUrl });
  core = coreProcess;
  markMain("coreForked");
  const ready = coreProcess.start();
  // ディスプレイの抜き差し・スリープを起動の記録に書く（画面が応答しなくなったきっかけを照らし合わせるため）
  logDisplayEvents();
  setMainWindowUrl(url);
  registerIpc(url, { core: coreIpcHandlers(coreProcess) });
  setAppMenu();
  // 画面のセッション（認証の Cookie）はコアの ready のあと。窓はその前に作り、読み込みだけ待たせる
  const session = ready.then(async (r) => {
    await prepareAppSession(url, r.token);
    allowHangStacks(url);
    startupLog("認証の Cookie を設定しました");
  });
  // ログイン時に起動したときは窓を出さずに裏で動かす（スマホから届くように本体だけ起こしておく。Dock を押せば activate で出る）
  if (openedAtLogin()) startupLog("ログイン時に起動したので、窓を出さずに動かします");
  else openMainWindow(url, session);
  try {
    const r = await ready;
    // コアのプロセスの段階（epoch ms。起動の時刻の 1 行に出す）
    markMain("core.processStart", r.timings.processStart);
    markMain("core.modulesLoaded", r.timings.modulesLoaded);
    markMain("core.dbOpened", r.timings.dbOpened);
    markMain("core.listening", r.timings.listening);
    markMain("coreReady");
    startupLog(`コアを起動しました ${r.localUrl} pid=${r.pid}`);
  } catch (e) {
    startupLog(`コアを起動できません: ${errorMessage(e)}`);
    dialog.showErrorBox("Kickoff を起動できません", `コアの起動に失敗しました（ポート ${port}）。\n${errorMessage(e)}`);
    app.quit();
    return;
  }
  await session;
  setDiagnosticsCore(coreProcess);
  // 60 秒ごとにプロセスと画面とコアのメモリを metrics.jsonl に書く
  startMetricsLog(() => coreProcess.call("metrics"));
  // 作業中と、スマホ連携がオンで電源につないでいる間は、本体を眠らせない（app/keepAwake.ts）
  startKeepAwake(coreProcess, (fn) => coreProcess.onState(fn));
  // 内蔵ターミナルのシェルはコアで動き、画面はコアの WebSocket でつなぐ。画面が消えたら、その画面のシェルを止める（terminal/terminals.ts）
  setTerminalCloser((owner) => void coreProcess.call("terminal.closeOwnedBy", owner).catch(() => {}));
  // 埋め込みブラウザの拡張機能（React DevTools など）を読み込む
  void loadSavedExtensions().then((errors) => errors.forEach((e) => console.warn("[browser] 拡張機能を読み込めません:", e)));
  // Mac では、ウィンドウを閉じたあとに Dock を押したら作り直す
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) openMainWindow(url);
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// 5. 終了時の片付け（shutdown.ts。before-quit の流れは変えない）
registerShutdown(() => core);
