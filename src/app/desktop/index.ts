// Electron のメインプロセスの入口。起動の順番だけを書く（中身は app/ ipc/ browser/ terminal/ notifications/ diagnostics/）
import { app, BrowserWindow, dialog } from "electron";
import { errorMessage } from "@shared/foundation/errors";
import { setAppMenu } from "@/foundation/desktop/app/appMenu";
import { dropCompileCacheEnv } from "@/foundation/desktop/app/compileCache";
import { prepareAppSession } from "@/foundation/desktop/app/appSession";
import { createCoreProcess } from "@/foundation/desktop/app/coreHost";
import type { CoreProcess } from "@/foundation/desktop/app/coreProcess";
import { seedDevDataOnce, setupEnvironment } from "@/foundation/desktop/app/environment";
import { registerShutdown } from "@/foundation/desktop/app/shutdown";
import { startKeepAwake } from "@/foundation/desktop/app/keepAwake";
import { openedAtLogin } from "@/foundation/desktop/app/loginItem";
import { logLaunch, startupLog, watchChildProcesses } from "@/foundation/desktop/app/startupLog";
import { allowHangStacks, enableHangStacks, logDisplayEvents } from "@/foundation/desktop/app/hangWatch";
import { openMainWindow, setMainWindowUrl, showMainWindow } from "@/foundation/desktop/app/window";
import { browserDesktop } from "@/features/browser/desktop";
import { diagnosticsDesktop } from "@/features/diagnostics/desktop";
import { watchMainStalls } from "@/foundation/desktop/app/stalls";
import { markMain, startMetricsLog } from "@/foundation/desktop/app/bootRecorder";
import { coreDesktop, foundationDesktop, registerIpc } from "@/foundation/desktop/foundationPart";
import { mergeParts, type DesktopPart } from "@/foundation/desktop/parts";
import { NATIVE_API } from "@/app/shared/ipc";
import { setTerminalCloser } from "@/foundation/desktop/terminal/terminals";
import { timed } from "@/foundation/core/system/stallWatch";

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
// 3. 機能の部品の起動の初めの分（埋め込みブラウザの安全設定・コンソールの見張りは、ウィンドウを作る前に登録しておく）
const featureParts: DesktopPart[] = [browserDesktop, diagnosticsDesktop];
for (const part of featureParts) part.start?.();

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
 * → コアの ready を待って画面のセッション → 画面を読み込む
 */
async function start() {
  markMain("whenReady");
  startupLog("whenReady");
  // 開発時は electron-vite の dev サーバーが画面を配り、製品版はコアが配る（URL はポートから先に分かる）
  const url = devUrl ?? `http://127.0.0.1:${port}`;
  const parts: DesktopPart[] = [foundationDesktop(url), ...featureParts];
  const coreProcess = createCoreProcess({ port, devUrl, hostMethods: mergeParts(parts).hostMethods });
  for (const part of parts) part.connectCore?.(coreProcess);
  core = coreProcess;
  markMain("coreForked");
  const ready = coreProcess.start();
  // ディスプレイの抜き差し・スリープを起動の記録に書く（画面が応答しなくなったきっかけを照らし合わせるため）
  logDisplayEvents();
  setMainWindowUrl(url);
  const merged = mergeParts([...parts, coreDesktop(coreProcess)]);
  registerIpc(url, NATIVE_API, merged);
  setAppMenu(merged.menu);
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
  // 機能の部品の準備ができたあとの分（記録にコアを入れる・埋め込みブラウザの拡張機能を読み込む）
  for (const part of parts) part.ready?.();
  // 60 秒ごとにプロセスと画面とコアのメモリを metrics.jsonl に書く
  startMetricsLog(() => coreProcess.call("metrics"));
  // 作業中と、スマホ連携がオンで電源につないでいる間は、本体を眠らせない（app/keepAwake.ts）
  startKeepAwake(coreProcess);
  // 内蔵ターミナルのシェルはコアで動き、画面はコアの WebSocket でつなぐ。画面が消えたら、その画面のシェルを止める（terminal/terminals.ts）
  setTerminalCloser((owner) => void coreProcess.call("terminal.closeOwnedBy", owner).catch(() => {}));
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
