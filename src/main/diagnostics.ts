import fs from "node:fs/promises";
import path from "node:path";
import { app, shell, type BrowserWindow, type WebContents } from "electron";
import type { DiagnosticsFolders, DiagnosticsState } from "../core/types.js";
import { errorMessage } from "../core/errors.js";
import { diagnosticsFolderName, perSecond, RENDERER_PROBE, topSelfTime, type CpuProfile, type Metrics } from "./profileSummary.js";

/** 記録する長さ（秒）。重いと感じる操作をその間に続けてもらう */
export const DIAGNOSTICS_SECONDS = 10;

/** 記録を保存するフォルダ（データの保存先の diagnostics/。開発版と製品版で別） */
export function diagnosticsRoot(): string {
  return path.join(app.getPath("userData"), "diagnostics");
}

/** 最近の記録として返す数 */
const RECENT_RECORDS = 5;

/** 保存先と、最近の記録のフォルダ（フォルダ名は日時なので、名前の逆順 = 新しい順）。まだ記録がなければ records は空 */
export async function diagnosticsFolders(): Promise<DiagnosticsFolders> {
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

let running = false;

/**
 * 性能の記録を取る（重いときに、再起動せずその場で）。Kickoff の画面に Electron のデバッガをつなぎ、
 * 10 秒間の CPU プロファイル・画面の要素の数・メモリ・処理の時間と、プロセスごとの CPU・メモリを集めて、
 * diagnostics/<日時>/ に summary.json と profile.cpuprofile（Chrome の開発者ツールで開ける）を保存する。
 * 外から入る口（デバッグ用のポート）は開かない。様子は画面へ kickoff:diagnostics で知らせる
 */
export async function startDiagnostics(win: BrowserWindow | undefined): Promise<void> {
  if (!win || win.isDestroyed()) return;
  const notify = (state: DiagnosticsState) => {
    if (!win.isDestroyed()) win.webContents.send("kickoff:diagnostics", state);
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
    const probe = await send<{ result: { value?: string } }>("Runtime.evaluate", { expression: RENDERER_PROBE, returnByValue: true });
    // プロセスごとの CPU は「前に測ってからの使用率」なので、記録の始めに一度測っておく
    app.getAppMetrics();
    await send("Profiler.enable");
    // 1 ミリ秒ごとに、いま実行している関数を記録する
    await send("Profiler.setSamplingInterval", { interval: 1000 });
    await send("Profiler.start");
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    const { profile } = await send<{ profile: CpuProfile }>("Profiler.stop");
    const after = await metrics();
    const page = JSON.parse(probe.result.value ?? "{}") as Record<string, unknown>;
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
      },
      perSecond: perSecond(before, after, seconds),
      // 記録した間のプロセスごとの CPU（%）とメモリ（MB）。Tab が画面、Browser がメインプロセス（コアのサーバーも同じプロセス）
      processes: app.getAppMetrics().map((p) => ({
        type: p.type,
        name: p.name ?? "",
        pid: p.pid,
        cpuPercent: Math.round(p.cpu.percentCPUUsage * 10) / 10,
        memoryMB: Math.round(p.memory.workingSetSize / 1024),
      })),
      hotspots: topSelfTime(profile, 40),
    };
    return { summary, profile };
  } finally {
    try {
      dbg.detach();
    } catch {
      // すでに外れていれば何もしない
    }
  }
}
