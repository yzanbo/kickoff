import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DiagnosticsOverview, StallDigest } from "@shared/ipc";
import type { StallRecord } from "../../core/system/stallWatch.js";
import type { BootRecord } from "./bootTimeline.js";

// 設定の「診断」に出す、いつも取っている記録のまとめ（メモの仕様書「0023_表示を軽くする」の U10）。
// ログの場所の stalls.jsonl（案 12）と boot.jsonl（案 18c）を、回した 1 世代（.1）も含めて読んで集める。Electron に依らない

/** 詰まりを数える長さ（最近 24 時間） */
const STALL_WINDOW_MS = 24 * 60 * 60 * 1000;

/** 1 行 1 件の JSON を読む（書きかけ・壊れた行は飛ばす） */
export function parseJsonl(text: string): unknown[] {
  const rows: unknown[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // 書いている途中で読んだ行などは飛ばす
    }
  }
  return rows;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** 詰まりの記録の行か（数えるのに使う項目だけ見る） */
function isStallRecord(v: unknown): v is StallRecord {
  return isObject(v) && typeof v.at === "string" && (v.process === "main" || v.process === "core") && typeof v.blockedMs === "number" && typeof v.kind === "string";
}

/** 起動の記録の行か */
function isBootRecord(v: unknown): v is BootRecord {
  return isObject(v) && typeof v.at === "string" && typeof v.originAt === "number" && Array.isArray(v.stages);
}

/**
 * 最近 24 時間の詰まりの件数と、プロセスごとのいちばん長かったもの。タイマーが間引かれただけ（throttled）は数えない。
 * 同じ処理を 10 秒にまとめた行は repeat の数で数え、長さはその中のいちばん長いもの
 */
export function summarizeStalls(rows: readonly unknown[], now: Date): DiagnosticsOverview["stalls"] {
  const since = now.getTime() - STALL_WINDOW_MS;
  let count = 0;
  const longest: DiagnosticsOverview["stalls"]["longest"] = { main: null, core: null };
  for (const row of rows) {
    if (!isStallRecord(row) || row.kind !== "blocked") continue;
    const at = Date.parse(row.at);
    if (!(at >= since && at <= now.getTime())) continue;
    count += typeof row.repeat === "number" && row.repeat > 1 ? row.repeat : 1;
    const current = longest[row.process];
    if (!current || row.blockedMs > current.blockedMs) {
      const digest: StallDigest = { at: row.at, blockedMs: row.blockedMs, task: row.task ?? null };
      longest[row.process] = digest;
    }
  }
  return { count, longest };
}

/** 最後の起動（メインのウィンドウの最初の読み込み = メインの始まりを起点にした行のうち最後のもの）。読み込み直し・別ウィンドウの行は使わない */
export function lastLaunch(rows: readonly unknown[]): DiagnosticsOverview["lastBoot"] {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (!isBootRecord(row) || row.origin !== "mainStart" || row.window !== "main") continue;
    const ms = (name: string) => row.stages.find((s) => s.name === name)?.ms ?? null;
    return { startedAt: new Date(row.originAt).toISOString(), firstPaintMs: ms("firstPaint"), interactiveMs: ms("interactive"), timedOut: row.timedOut === true };
  }
  return null;
}

/** 回した 1 世代（.1）と今のファイルを、古い順につないで読む（なければ空） */
async function readRotated(dir: string, name: string): Promise<unknown[]> {
  const read = (file: string) => readFile(path.join(dir, file), "utf8").catch(() => "");
  const [older, current] = await Promise.all([read(`${name}.1`), read(name)]);
  return [...parseJsonl(older), ...parseJsonl(current)];
}

/** ログの場所の記録を読んでまとめる */
export async function readLogOverview(dir: string, now: Date): Promise<DiagnosticsOverview> {
  const [stalls, boots] = await Promise.all([readRotated(dir, "stalls.jsonl"), readRotated(dir, "boot.jsonl")]);
  return { logsDir: dir, stalls: summarizeStalls(stalls, now), lastBoot: lastLaunch(boots) };
}
