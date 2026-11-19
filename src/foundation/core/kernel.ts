// コアの土台の束（Kernel）。機能はこれと下の機能の口を受けて作る（組み立ては @/app/core/startCore.ts）。
// 開くのは createKernel（保存先 → Bus → 子プロセスの知らせ → DB）、閉じるのは closeKernel（HTTP を止めたあと）
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { Bus } from "@/foundation/core/bus";
import { systemClock, type Clock } from "@/foundation/core/clock";
import { DB_FILE } from "@/foundation/core/db/open";
import { Store } from "@/foundation/core/db/store";
import { loadOrCreateToken } from "@/foundation/core/http/auth";
import type { HostPlatform } from "@/foundation/core/platform/types";
import { setChildProcessReporter, type ChildProcessNote } from "@/foundation/core/system/childProcesses";
import { runCommand } from "@/foundation/core/system/exec";
import { streamCommand } from "@/foundation/core/system/stream";

/** 外部コマンド（終わるまで待つ run・流れ続ける stream） */
export interface Exec {
  run: typeof runCommand;
  stream: typeof streamCommand;
}

export interface CorePaths {
  /** 保存先（Kickoff / Kickoff Dev） */
  readonly dataDir: string;
  readonly port: number;
  /** 待ち受けるアドレス（既定 127.0.0.1） */
  readonly host: string;
  /** 製品版の画面（開発は null） */
  readonly staticDir: string | null;
  /** platform.appDataRoot と同じ */
  readonly appDataRoot: string;
  /** meta の database_id */
  readonly databaseId: string;
}

/** コアの記録（頭に [core] を付けて出す） */
export interface Log {
  info(msg: string): void;
  warn(msg: string, e?: unknown): void;
  error(msg: string, e?: unknown): void;
}

export interface Kernel {
  readonly clock: Clock;
  readonly bus: Bus;
  readonly db: DatabaseSync;
  readonly exec: Exec;
  /** 機能に依らない OS の口（機能だけが使う値は組み立てが機能へ渡す） */
  readonly platform: HostPlatform;
  readonly paths: CorePaths;
  readonly settings: Store["settings"];
  readonly secrets: Store["secrets"];
  readonly log: Log;
}

/** 表ごとの店の束と本体のトークンも持つ仮の形（店は DB の土台を作り直すときに機能へ、トークンは HTTP の土台へ移す） */
export interface KernelWithStore extends Kernel {
  readonly store: Store;
  readonly token: string;
}

export interface KernelOptions {
  dataDir: string;
  port: number;
  host?: string;
  staticDir?: string;
  platform: HostPlatform;
  /** 既定 systemClock（テストは manualClock を渡せる） */
  clock?: Clock;
  /** 起こした子プロセスの知らせ（コアのプロセスがメインへ送る。system/childProcesses.ts） */
  onChildProcess?: (note: ChildProcessNote) => void;
}

const consoleLog: Log = {
  info: (msg) => console.log(`[core] ${msg}`),
  warn: (msg, e) => (e === undefined ? console.warn(`[core] ${msg}`) : console.warn(`[core] ${msg}`, e)),
  error: (msg, e) => (e === undefined ? console.error(`[core] ${msg}`) : console.error(`[core] ${msg}`, e)),
};

/** 子プロセスの知らせを渡した Kernel（閉じるときにその知らせを外す） */
const reporting = new WeakSet<Kernel>();

/** 土台を開く: 保存先を作る → Bus → 子プロセスの知らせ → DB を開いて版をそろえる → 本体のトークン */
export function createKernel(opts: KernelOptions): KernelWithStore {
  fs.mkdirSync(opts.dataDir, { recursive: true });
  const bus = new Bus();
  if (opts.onChildProcess) setChildProcessReporter(opts.onChildProcess);
  const store = new Store(path.join(opts.dataDir, DB_FILE), (e) => bus.publish(e));
  const k: KernelWithStore = {
    clock: opts.clock ?? systemClock,
    bus,
    db: store.db,
    exec: { run: runCommand, stream: streamCommand },
    platform: opts.platform,
    paths: { dataDir: opts.dataDir, port: opts.port, host: opts.host ?? "127.0.0.1", staticDir: opts.staticDir ?? null, appDataRoot: opts.platform.appDataRoot, databaseId: store.databaseId },
    settings: store.settings,
    secrets: store.secrets,
    log: consoleLog,
    store,
    token: loadOrCreateToken(opts.dataDir),
  };
  if (opts.onChildProcess) reporting.add(k);
  return k;
}

/** 土台を閉じる（Bus の段にためたものを流す → DB を閉じる → 子プロセスの知らせを外す）。HTTP はその前に止める */
export function closeKernel(k: Kernel): void {
  k.bus.flush();
  k.db.close();
  if (reporting.has(k)) setChildProcessReporter(null);
}
