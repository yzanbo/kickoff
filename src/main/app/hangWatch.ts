// 画面（レンダラー）が応答しなくなったときの記録と立て直し。外部ディスプレイをつなぐ・外したあとなどに画面がクリックも入力も受けなくなり、
// アプリごと起動し直すしかなかった（起動の記録には「応答しません」だけが残り、戻った記録はなかった。2026-11-14 の利用者の報告）。
// 原因をその場で突き止められるよう、止まっている JavaScript の場所と、そのころのディスプレイ・スリープの出来事を起動の記録に書き、
// 止まったままなら「画面を読み込み直す」を聞く（コアは同じプロセスで動き続けるので、AI の作業は止まらない）
import { app, dialog, powerMonitor, screen, session, type BrowserWindow } from "electron";
import { errorMessage } from "@shared/errors";
import { startupLog } from "./startupLog.js";

/** 応答しなくなってから、まだ戻らなければ聞くまでの時間 */
const ASK_AFTER_MS = 10_000;
/** 止まっている JavaScript の場所を待つ時間（JavaScript が動いていなければ返らない） */
const STACK_WAIT_MS = 3_000;

/**
 * 止まっている JavaScript の場所を取れるようにする（Electron の collectJavaScriptCallStack には、この機能と画面の応答の Document-Policy が要る）。
 * ready の前に呼ぶ
 */
export function enableHangStacks() {
  app.commandLine.appendSwitch("enable-features", "DocumentPolicyIncludeJSCallStacksInCrashReports");
}

/** Kickoff の画面（uiUrl の出どころ）の応答に Document-Policy を足す（埋め込みブラウザは別のセッションなので触らない） */
export function allowHangStacks(uiUrl: string) {
  const origin = new URL(uiUrl).origin;
  session.defaultSession.webRequest.onHeadersReceived({ urls: [`${origin}/*`] }, (details, callback) => {
    if (details.resourceType !== "mainFrame") return callback({});
    callback({ responseHeaders: { ...details.responseHeaders, "Document-Policy": ["include-js-call-stacks-in-crash-reports"] } });
  });
}

/** ディスプレイの抜き差し・解像度の変化とスリープ・画面のロックを起動の記録に書く（固まったときに、きっかけを照らし合わせるため）。ready のあとに呼ぶ */
export function logDisplayEvents() {
  const describe = () =>
    screen
      .getAllDisplays()
      .map((d) => `${d.label || d.id} ${d.size.width}x${d.size.height}@${d.scaleFactor}${d.internal ? " 内蔵" : ""}`)
      .join(" / ");
  screen.on("display-added", () => startupLog(`ディスプレイをつなぎました: ${describe()}`));
  screen.on("display-removed", () => startupLog(`ディスプレイを外しました: ${describe()}`));
  // 変わった項目のない知らせは書かない（macOS 27 では 0.1 秒ごとに何度も届くことがあった）
  screen.on("display-metrics-changed", (_e, d, changed) => {
    if (changed.length > 0) startupLog(`ディスプレイが変わりました（${changed.join(",")}）: ${d.label || d.id} ${d.size.width}x${d.size.height}@${d.scaleFactor}`);
  });
  powerMonitor.on("suspend", () => startupLog("スリープします"));
  powerMonitor.on("resume", () => startupLog("スリープから戻りました"));
  powerMonitor.on("lock-screen", () => startupLog("画面をロックしました"));
  powerMonitor.on("unlock-screen", () => startupLog("画面のロックを解きました"));
}

/**
 * ウィンドウの画面が応答しなくなったら、止まっている JavaScript の場所を起動の記録に書き、ASK_AFTER_MS たっても戻らなければ
 * 「画面を読み込み直す / 待つ」を聞く。読み込み直すは、止まった画面のプロセスを止めて新しいプロセスで読み込み直す（書きかけの入力は
 * 画面が保存したところまで残る）。戻ったら聞く窓を閉じる。label は記録に書くウィンドウの名前
 */
export function watchRendererHang(win: BrowserWindow, label: string) {
  const contents = win.webContents;
  let hungAt: number | undefined;
  let timer: NodeJS.Timeout | undefined;
  let asking: AbortController | undefined;

  const recover = () => {
    clearTimeout(timer);
    timer = undefined;
    asking?.abort();
    asking = undefined;
  };
  const ask = async () => {
    timer = undefined;
    if (win.isDestroyed() || hungAt === undefined || asking) return;
    asking = new AbortController();
    startupLog(`${label}: 応答しないままなので、読み込み直すかを聞きます`);
    const { response } = await dialog.showMessageBox(win, {
      type: "warning",
      message: "画面が応答しません",
      detail: "Kickoff の画面が操作を受け付けていません。画面だけを読み込み直せます（AI の作業は止まりません）。\n画面が戻れば、この確認は自動で閉じます。",
      buttons: ["画面を読み込み直す", "待つ"],
      defaultId: 0,
      cancelId: 1,
      signal: asking.signal,
    });
    const aborted = asking?.signal.aborted ?? true;
    asking = undefined;
    if (aborted) startupLog(`${label}: 画面が戻ったので、確認を閉じました`);
    if (aborted || win.isDestroyed()) return;
    if (response !== 0) {
      startupLog(`${label}: 待つを選びました`);
      return;
    }
    startupLog(`${label}: 画面を読み込み直します`);
    hungAt = undefined;
    // 止まったプロセスでは読み込み直しが進まないので、プロセスを止めてから新しいプロセスで読み込む
    contents.forcefullyCrashRenderer();
    contents.reload();
  };

  // 止まったままなら、押すたびに届く（「待つ」を選んだあとも、また押して届いたら聞き直す）
  contents.on("unresponsive", () => {
    const first = hungAt === undefined;
    hungAt ??= Date.now();
    startupLog(`${label}: 画面が応答しません（unresponsive）`);
    if (first) void collectStack(win).then((stack) => startupLog(`${label}: 止まっている JavaScript: ${stack}`));
    if (!timer && !asking) timer = setTimeout(() => void ask().catch((e: unknown) => startupLog(`${label}: 聞けませんでした ${errorMessage(e)}`)), ASK_AFTER_MS);
  });
  contents.on("responsive", () => {
    const took = hungAt === undefined ? "" : `（${Math.round((Date.now() - hungAt) / 1000)} 秒）`;
    hungAt = undefined;
    recover();
    startupLog(`${label}: 画面が応答を戻しました（responsive）${took}`);
  });
  contents.on("render-process-gone", recover);
  win.on("closed", recover);
}

/** 止まっている JavaScript の場所（JavaScript が動いていない・取れないときはその旨） */
async function collectStack(win: BrowserWindow): Promise<string> {
  if (win.isDestroyed()) return "（ウィンドウがありません）";
  const stack = win.webContents.mainFrame.collectJavaScriptCallStack();
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), STACK_WAIT_MS));
  try {
    const result = await Promise.race([stack, timeout]);
    if (result === null) return `（${STACK_WAIT_MS / 1000} 秒待っても返りません。JavaScript は動いておらず、描画・GPU・OS の側で止まっているかもしれません）`;
    return result ? `\n${result}` : "（取れませんでした）";
  } catch (e) {
    return `（取れませんでした: ${errorMessage(e)}）`;
  }
}
