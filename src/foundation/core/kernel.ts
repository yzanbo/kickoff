// コアの土台の束（Kernel）。機能はこれと下の機能の口を受けて作る（組み立ては @/app/core/startCore.ts）。
// 開くのは createKernel（保存先 → Bus → 子プロセスの知らせ → DB）、閉じるのは closeKernel（HTTP を止めたあと）
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { Bus } from "@/foundation/core/bus";
import { systemClock, type Clock } from "@/foundation/core/clock";
import { DB_FILE, openDb, readDatabaseId, type Migration } from "@/foundation/core/db/db";
import { createSecretStore, type SecretStore } from "@/foundation/core/settings/secretStore";
import { openAppSettings, type SettingsStore } from "@/foundation/core/settings/settingsStore";
import type { AppSettings, SettingsPatch, SettingTable } from "@shared/foundation/contract/settings";
import type { HostPlatform } from "@/foundation/core/platform/types";
import { setChildProcessReporter, type ChildProcessNote } from "@/foundation/core/system/childProcesses";
import { runCommand } from "@/foundation/core/system/exec";
import { stopAllStreams, streamCommand } from "@/foundation/core/system/stream";
import { createWorkplaceKit, type WorkplaceKit } from "@/foundation/core/workplace/kit";

/** 外部コマンド（終わるまで待つ run・流れ続ける stream・流れ続けているものを全部止める stopAllStreams） */
export interface Exec {
  run: typeof runCommand;
  stream: typeof streamCommand;
  stopAllStreams: typeof stopAllStreams;
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
  /** アプリ全体の設定（既定 ＋ 保存した値。知らないキーは返さない） */
  readonly settings: SettingsStore<AppSettings, SettingsPatch>;
  /** 秘密の値（API キー・DB のパスワードなど。名前の形は使う機能が決める。設定・SSE・API の応答には出さない） */
  readonly secrets: SecretStore<string>;
  readonly log: Log;
  /** 作業場所の登録先（上の機能が登録する口。workplace/kit.ts） */
  readonly workplace: WorkplaceKit;
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
  /** DB のファイル（既定は保存先の kickoff.db。テストは ":memory:"） */
  dbFile?: string;
  /** スキーマの版（組み立てが全部の機能の版を並べて渡す。@/app/core/migrations.ts） */
  migrations: readonly Migration[];
  /** 設定の表（組み立てが全部の機能の表を束ねて渡す。@/app/shared/settings.ts の ALL_SETTINGS） */
  settings: SettingTable;
}

const consoleLog: Log = {
  info: (msg) => console.log(`[core] ${msg}`),
  warn: (msg, e) => (e === undefined ? console.warn(`[core] ${msg}`) : console.warn(`[core] ${msg}`, e)),
  error: (msg, e) => (e === undefined ? console.error(`[core] ${msg}`) : console.error(`[core] ${msg}`, e)),
};

/** 子プロセスの知らせを渡した Kernel（閉じるときにその知らせを外す） */
const reporting = new WeakSet<Kernel>();

/** 土台を開く: 保存先を作る → Bus → 子プロセスの知らせ → DB を開いて版をそろえる（版は opts.migrations）→ 土台の店（設定（表は opts.settings）・秘密の値・DB の ID） */
export function createKernel(opts: KernelOptions): Kernel {
  fs.mkdirSync(opts.dataDir, { recursive: true });
  const bus = new Bus();
  if (opts.onChildProcess) setChildProcessReporter(opts.onChildProcess);
  const db = openDb(opts.dbFile ?? path.join(opts.dataDir, DB_FILE), opts.migrations);
  const databaseId = readDatabaseId(db);
  const k: Kernel = {
    clock: opts.clock ?? systemClock,
    bus,
    db,
    exec: { run: runCommand, stream: streamCommand, stopAllStreams },
    platform: opts.platform,
    paths: { dataDir: opts.dataDir, port: opts.port, host: opts.host ?? "127.0.0.1", staticDir: opts.staticDir ?? null, appDataRoot: opts.platform.appDataRoot, databaseId },
    settings: openAppSettings(db, opts.settings, (settings) => bus.publish({ type: "settings", settings })),
    secrets: createSecretStore(db),
    log: consoleLog,
    workplace: createWorkplaceKit(),
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
