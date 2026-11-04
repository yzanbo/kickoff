import fs from "node:fs/promises";
import path from "node:path";
import { app, BrowserWindow, shell, type WebContents } from "electron";
import type { DiagnosticsFolders, DiagnosticsState } from "@shared/ipc";
import { errorMessage } from "@shared/errors";
import { logsDir } from "../app/logs.js";
import { mainWindow } from "../app/window.js";
import { sendEvent, type IpcHandlers } from "../ipc/register.js";
import { startMainRecording } from "./mainProcess.js";
import { diagnosticsFolderName, perSecond, RENDERER_PROBE, startCpuProfile, topSelfTime, type Metrics } from "./profileSummary.js";
import { RENDERER_COLLECT, RENDERER_OBSERVE, summarizeFrames, summarizeInteractions, type RendererTimings } from "./rendererTiming.js";

/** 記録する長さ（秒）。重いと感じる操作をその間に続けてもらう */
export const DIAGNOSTICS_SECONDS = 10;

/**
 * 記録を保存するフォルダ（ログの場所の diagnostics/。app/logs.ts）。
 * 以前はデータの保存先（Application Support）に置いていたが、そこはエージェントから読めないので、場所をチャットに貼っても読んでもらえなかった
 */
function diagnosticsRoot(): string {
  return path.join(logsDir(), "diagnostics");
}

/** 以前の保存先（データの保存先の diagnostics/）に残っている記録を、いまの保存先へ移す（起動したときに 1 回） */
export async function moveLegacyDiagnostics(): Promise<void> {
  const legacy = path.join(app.getPath("userData"), "diagnostics");
  const entries = await fs.readdir(legacy, { withFileTypes: true }).catch(() => null);
  if (!entries) return;
  await fs.mkdir(diagnosticsRoot(), { recursive: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    // 同じ名前（同じ日時）の記録がもうあれば、移さずに残す
    await fs.rename(path.join(legacy, e.name), path.join(diagnosticsRoot(), e.name)).catch(() => {});
  }
  // 空になったら消す（残ったものがあれば消さない）
  await fs.rmdir(legacy).catch(() => {});
}

/** 最近の記録として返す数 */
const RECENT_RECORDS = 5;

/** 保存先と、最近の記録のフォルダ（フォルダ名は日時なので、名前の逆順 = 新しい順）。まだ記録がなければ records は空 */
async function diagnosticsFolders(): Promise<DiagnosticsFolders> {
  const root = diagnosticsRoot();
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const records = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse()
    .slice(0, RECENT_RECORDS)
    .map((name) => path.join(root, name));
  return { root, records };
}

/** 保存先のフォルダを Finder で開く（まだなければ作る） */
export async function openDiagnosticsRoot(): Promise<void> {
  await fs.mkdir(diagnosticsRoot(), { recursive: true });
  await shell.openPath(diagnosticsRoot());
}

/** 性能の記録（IPC の diagnostics）。記録を取るのは、頼んできた画面のウィンドウ（なければメインのウィンドウ） */
export const diagnosticsHandlers: IpcHandlers["diagnostics"] = {
  start: (e) => void startDiagnostics(BrowserWindow.fromWebContents(e.sender) ?? mainWindow()),
  folders: () => diagnosticsFolders(),
  openRoot: () => openDiagnosticsRoot(),
};

let running = false;

/**
 * 性能の記録を取る（重いときに、再起動せずその場で）。Kickoff の画面に Electron のデバッガをつなぎ、
 * 10 秒間の CPU プロファイル・画面の要素の数・メモリ・処理の時間と、プロセスごとの CPU・メモリを集めて、
 * diagnostics/<日時>/ に summary.json と profile.cpuprofile（Chrome の開発者ツールで開ける）を保存する。
 * 外から入る口（デバッグ用のポート）は開かない。様子は画面へ知らせる（diagnostics.onState）
 */
export async function startDiagnostics(win: BrowserWindow | undefined): Promise<void> {
  if (!win || win.isDestroyed()) return;
  const notify = (state: DiagnosticsState) => {
    if (!win.isDestroyed()) sendEvent(win.webContents, "diagnostics", "onState", state);
  };
  if (running) return;
  running = true;
  try {
    notify({ state: "recording", endsAt: Date.now() + DIAGNOSTICS_SECONDS * 1000 });
    const result = await capture(win.webContents, DIAGNOSTICS_SECONDS);
    notify({ state: "saving" });
    const dir = path.join(diagnosticsRoot(), diagnosticsFolderName(new Date()));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "summary.json"), JSON.stringify(result.summary, null, 2));
    await fs.writeFile(path.join(dir, "profile.cpuprofile"), JSON.stringify(result.profile));
    if (result.mainProfile) await fs.writeFile(path.join(dir, "main.cpuprofile"), JSON.stringify(result.mainProfile));
    const { renderer, perSecond: rate } = result.summary;
    notify({
      state: "done",
      dir,
      summary: { domNodes: renderer.domNodes, heapMB: renderer.heapMB, scriptMsPerSec: rate.scriptMs, layoutMsPerSec: rate.layoutMs },
    });
  } catch (e) {
    notify({ state: "error", message: errorMessage(e) });
  } finally {
    running = false;
  }
}

/** デバッガをつないで測る（終わったら必ず外す） */
async function capture(wc: WebContents, seconds: number) {
  const dbg = wc.debugger;
  try {
    dbg.attach("1.3");
  } catch (e) {
    throw new Error(`記録を始められませんでした（開発者ツールを開いているときは、閉じてからもう一度試してください）: ${errorMessage(e)}`);
  }
  const send = <T = unknown>(method: string, params?: object) => dbg.sendCommand(method, params) as Promise<T>;
  const metrics = async (): Promise<Metrics> =>
    Object.fromEntries((await send<{ metrics: { name: string; value: number }[] }>("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  try {
    await send("Performance.enable");
    const before = await metrics();
    const evaluate = async (expression: string) =>
      JSON.parse((await send<{ result: { value?: string } }>("Runtime.evaluate", { expression, returnByValue: true })).result.value ?? "{}") as Record<string, unknown>;
    const page = await evaluate(RENDERER_PROBE);
    // 操作の遅れ（キー入力などが画面に出るまで）と長いフレームを、記録の間だけ画面で集める
    await evaluate(RENDERER_OBSERVE);
    const stopMain = await startMainRecording(app.getPath("userData"));
    // プロセスごとの CPU は「前に測ってからの使用率」なので、記録の始めに一度測っておく
    app.getAppMetrics();
    const stopProfile = await startCpuProfile(send);
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    const profile = await stopProfile();
    const main = await stopMain();
    const after = await metrics();
    const timings = (await evaluate(RENDERER_COLLECT)) as unknown as RendererTimings;
    // ごみ集め（GC）をしてから測り直す。GC のあとも残るメモリ・ノードが多ければ、どこかで持ち続けている（漏れ）
    await send("HeapProfiler.collectGarbage");
    const afterGc = await metrics();
    const appMetrics = app.getAppMetrics();
    const summary = {
      capturedAt: new Date().toISOString(),
      app: { name: app.getName(), version: app.getVersion(), packaged: app.isPackaged, electron: process.versions.electron },
      /** 起動してからの時間（秒） */
      uptimeSec: Math.round(process.uptime()),
      seconds,
      renderer: {
        ...page,
        domNodes: Math.round(after.Nodes ?? 0),
        heapMB: Math.round((after.JSHeapUsedSize ?? 0) / 1048576),
        heapTotalMB: Math.round((after.JSHeapTotalSize ?? 0) / 1048576),
        eventListeners: Math.round(after.JSEventListeners ?? 0),
        documents: Math.round(after.Documents ?? 0),
        /** GC のあとのメモリ（MB） */
        heapAfterGcMB: Math.round((afterGc.JSHeapUsedSize ?? 0) / 1048576),
        /** GC のあとのノード（テキストも含む）と、文書に付いているノードの数。差が大きければ、外したノードを持ち続けている目安 */
        nodesAfterGc: Math.round(afterGc.Nodes ?? 0),
        attachedNodes: timings.attachedNodes,
        detachedNodesApprox: Math.max(0, Math.round(afterGc.Nodes ?? 0) - timings.attachedNodes),
      },
      perSecond: perSecond(before, after, seconds),
      /** 記録の間の操作（キー入力・クリックなど）で、16ms 以上かかったもの。inputDelay = 処理が始まるまで待たされた時間 */
      interactions: summarizeInteractions(timings.events ?? []),
      /** 50ms 以上かかったフレームと、その中で時間を使ったスクリプト */
      longFrames: summarizeFrames(timings.frames ?? []),
      longTasks: { count: timings.longTasks ?? 0, totalMs: timings.longTaskMs ?? 0 },
      /** メインプロセス（コアのサーバー・DB も同じ）。CPU プロファイルは main.cpuprofile */
      main: main.summary,
      // 記録した間のプロセスごとの CPU（%）とメモリ（MB）。Tab が画面、Browser がメインプロセス（コアのサーバーも同じプロセス）
      processes: appMetrics.map((p) => ({
        type: p.type,
        name: p.name ?? "",
        pid: p.pid,
        cpuPercent: Math.round(p.cpu.percentCPUUsage * 10) / 10,
        memoryMB: Math.round(p.memory.workingSetSize / 1024),
      })),
      hotspots: topSelfTime(profile, 40),
    };
    return { summary, profile, mainProfile: main.profile };
  } finally {
    try {
      dbg.detach();
    } catch {
      // すでに外れていれば何もしない
    }
  }
}
