// 起動の記録（~/Library/Logs/<アプリ名>/startup.log）。アプリを入れ替えた直後の初回だけ画面が出ないことがあり、
// macOS の記録では画面の中で何が起きたか分からなかったため、起動の各段階・画面の読み込み・失敗をアプリ自身が書き残す。
// エージェントからも読める場所（データの保存先 Application Support は selfProtection.ts で読めない）に置く
import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import path from "node:path";
import { app, type WebContents } from "electron";
import { errorMessage } from "@shared/errors";

/** これを超えたら 1 世代だけ残して新しく書き始める */
const MAX_BYTES = 512 * 1024;
/** 画面の読み込みがこの時間で終わらなければ、そのときの様子を書く */
const LOAD_WATCH_MS = 10_000;

let file: string | undefined;
const startedAt = Date.now();

function logFile(): string {
  if (!file) {
    const dir = path.join(app.getPath("home"), "Library", "Logs", app.getName());
    mkdirSync(dir, { recursive: true });
    file = path.join(dir, "startup.log");
    try {
      if (statSync(file).size > MAX_BYTES) renameSync(file, `${file}.1`);
    } catch {
      // まだない
    }
  }
  return file;
}

/** 1 行書く（時刻と起動からの経過・プロセス番号を添える）。書けなくてもアプリは止めない */
export function startupLog(message: string) {
  try {
    const line = `${new Date().toISOString()} +${Date.now() - startedAt}ms pid=${process.pid} ${message}\n`;
    appendFileSync(logFile(), line);
  } catch {
    // 記録が書けないだけなので無視する
  }
}

/** 起動の始まり（版・Electron の版・パッケージ済みか） */
export function logLaunch() {
  startupLog(`---- 起動 ${app.getName()} ${app.getVersion()} electron=${process.versions.electron} packaged=${app.isPackaged} path=${app.getAppPath()}`);
}

/** メインのウィンドウの画面の読み込みと、画面のプロセスの異常を書く */
export function watchWindowLoad(contents: WebContents, url: string) {
  startupLog(`画面の読み込みを始めます ${url}`);
  let finished = false;
  contents.on("did-start-loading", () => startupLog("did-start-loading"));
  contents.on("dom-ready", () => startupLog("dom-ready"));
  contents.on("did-finish-load", () => {
    finished = true;
    startupLog("did-finish-load");
  });
  contents.on("did-fail-load", (_e, code, description, failedUrl, isMainFrame) => {
    if (isMainFrame) startupLog(`did-fail-load code=${code} ${description} ${failedUrl}`);
  });
  contents.on("render-process-gone", (_e, details) => startupLog(`render-process-gone reason=${details.reason} exitCode=${details.exitCode}`));
  contents.on("unresponsive", () => startupLog("画面が応答しません（unresponsive）"));
  contents.on("responsive", () => startupLog("画面が応答を戻しました（responsive）"));
  contents.on("preload-error", (_e, preloadPath, error) => startupLog(`preload-error ${preloadPath} ${errorMessage(error)}`));
  // 画面の JavaScript のエラー（描けなかった理由が分かるように。警告は多いので書かない）
  contents.on("console-message", (e) => {
    if (e.level === "error") startupLog(`console.error ${e.message} (${e.sourceId}:${e.lineNumber})`);
  });
  setTimeout(() => {
    if (finished) return;
    startupLog(`${LOAD_WATCH_MS / 1000} 秒たっても画面の読み込みが終わっていません loading=${contents.isLoading()} url=${contents.getURL()} crashed=${contents.isCrashed()}`);
  }, LOAD_WATCH_MS);
}

/** GPU などの子プロセスの異常終了（画面が真っ暗になる原因になるため） */
export function watchChildProcesses() {
  app.on("child-process-gone", (_e, details) => startupLog(`child-process-gone type=${details.type} reason=${details.reason} exitCode=${details.exitCode} name=${details.name ?? ""}`));
}
