// メインプロセスとコアのプロセス（utilityProcess）のやり取りの形と、まとまりの頭を付けた写しの補助（Electron に依らない。メインも読む）。
// 口は utilityProcess の parentPort 1 本で、呼ぶ・答える・知らせる（RpcMessage）と、起動の init / ready / failed、DB ワーカーの port を運ぶ。
// 機能の呼び出し・知らせ（ブラウザ・鍵・診断・ターミナル・通知）は @/app/core/hostRemote.ts が declare module で足す
import type { StallRecord } from "@/foundation/core/system/stallWatch";
import type { ChildProcessNote } from "@/foundation/core/system/childProcesses";

/** 中断にした作業中のチャットの文を選ぶ（前のコアの終わり方: アプリの終了 / コアが落ちた） */
export type RecoveredReason = "quit" | "crash";

/** メインがコアに渡す起動の値 */
export interface CoreInit {
  dataDir: string;
  port: number;
  /** 製品版はコアが画面を配る。開発は null（electron-vite の dev サーバーが配る） */
  staticDir: string | null;
  terminalEnv: Record<string, string>;
  /** macOS の音声認識の補助コマンドの場所 */
  speechHelper: string;
  /** メインプロセスの pid（自分を守る仕組み・ポートの一覧が、メインも自分として扱う） */
  hostPid: number;
  /** ログの場所（~/Library/Logs/<アプリ名>。コアの詰まりの記録 stalls.jsonl を書き足す） */
  logsDir: string;
  /** メインのプロセスが始まった時刻（epoch ms。起動の時刻の記録） */
  hostStartedAt: number;
  recoveredReason: RecoveredReason;
}

/** コアの起動の各段階（epoch ms） */
interface CoreTimings {
  processStart: number;
  modulesLoaded: number;
  dbOpened: number;
  listening: number;
}

/** コアの準備ができた（画面のセッションの Cookie を置く token と、URL・pid・起動の時刻） */
export interface CoreReady {
  token: string;
  localUrl: string;
  pid: number;
  timings: CoreTimings;
}

/** 呼ぶ・答える・知らせる */
export type RpcMessage =
  | { t: "call"; id: number; method: string; args: unknown[] }
  | { t: "result"; id: number; ok: true; value: unknown }
  | { t: "result"; id: number; ok: false; error: string }
  | { t: "event"; name: string; payload: unknown };

/** メイン → コア（port は DB ワーカーとの MessagePort を添えて送る） */
export type HostToCore = { t: "init"; init: CoreInit } | { t: "port"; purpose: "dbWorker"; workerId: number } | RpcMessage;
/** コア → メイン */
export type CoreToHost = { t: "ready"; ready: CoreReady } | { t: "failed"; message: string } | RpcMessage;

/** コアの性能の記録（診断の 10 秒の間。メインの mainProcess.ts の分と同じ形の、コアのプロセスの分） */
export interface CoreDiagnostics {
  summary: Record<string, unknown>;
  /** コアの CPU プロファイル（core.cpuprofile。取れなければ null） */
  profile: unknown;
}

/** まとまりの頭を付けた表（{ tabs(): … } → { "browser.tabs"(): … }） */
export type Prefixed<P extends string, T> = { [K in keyof T & string as `${P}.${K}`]: T[K] };

/** RPC のうち写しが使う所（呼ぶ・知らせる） */
interface RpcLike {
  call(method: string, ...args: unknown[]): Promise<unknown>;
  emit(name: string, payload: unknown): void;
}

/** 相手の "<group>.<名前>" を呼ぶ口を作る（emit の名前は返事のない知らせ "<group>.<名前>" を送る） */
export function prefixedClient<T>(rpc: RpcLike, group: string, methods: readonly (keyof T & string)[], opts: { emit?: readonly (keyof T & string)[] } = {}): T {
  const client: Record<string, unknown> = {};
  for (const method of methods) client[method] = (...args: unknown[]) => rpc.call(`${group}.${method}`, ...args);
  for (const name of opts.emit ?? []) client[name] = (payload: unknown) => rpc.emit(`${group}.${name}`, payload);
  return client as T;
}

/** impl の操作を "<group>.<名前>" で受ける口にする（impl のメソッドとして呼ぶ） */
export function prefixedHandlers<P extends string, T, M extends keyof T & string>(group: P, impl: T, methods: readonly M[]): Prefixed<P, Pick<T, M>> {
  return Object.fromEntries(methods.map((method) => [`${group}.${method}`, (...args: unknown[]) => (impl[method] as (...a: unknown[]) => unknown)(...args)])) as Prefixed<P, Pick<T, M>>;
}

/** 呼び出しごとの時間の上限（ms。null は上限なし）。"<group>.*" はまとまりの全部、default はほか */
export type TimeoutTable<M> = { readonly default: number } & { readonly [K in keyof M & string]?: number | null } & { readonly [G in `${string}.*`]?: number | null };

/** 表から呼び出しの時間の上限を引く（名前 → まとまり → default の順） */
export function timeoutOf(table: TimeoutTable<unknown>, method: string): number | null {
  const entries = table as Readonly<Record<string, number | null | undefined>>;
  const group = `${method.split(".")[0]}.*`;
  if (Object.hasOwn(entries, method)) return entries[method] ?? null;
  if (method.includes(".") && Object.hasOwn(entries, group)) return entries[group] ?? null;
  return table.default;
}

/** メイン → コアの、機能に依らない呼び出し */
export interface BaseCoreMethods {
  /** 片付けて終わる（答えたあと、コアは自分で終わる） */
  close(): Promise<void>;
  /** 応答の見張り（コアの時刻を返す） */
  ping(): Promise<number>;
  /** 作業中のチャット（終了してよいかを聞くダイアログに名前を並べる） */
  runningChats(): Promise<{ id: number; title: string | null }[]>;
  /** コアのプロセスのメモリ（60 秒ごとの metrics.jsonl） */
  metrics(): Promise<{ heapUsedMB: number; rssMB: number }>;
}

/** DB ワーカーを作る口（作るのはメイン、話すのはコア。メインのコアの見張り役が持つ） */
export interface DbWorkerSpawner {
  /** 作る（env はコアの process.env = 読み込んだログインシェルの PATH を含む）。番号を返し、MessagePort を { t: "port" } で送る */
  spawn(env: Record<string, string>): Promise<number>;
  kill(workerId: number): Promise<void>;
}

/** 眠らせない理由（作業中の数とスマホ連携のオン・オフ。変わったときだけ） */
export interface AwakeNeeds {
  running: number;
  mobileEnabled: boolean;
}

/** コア → メインの、機能に依らない知らせ */
export interface BaseCoreEvents {
  awake: AwakeNeeds;
  stall: StallRecord;
  children: ChildProcessNote;
}

/** 機能の呼び出し・知らせ（土台は空。@/app/core/hostRemote.ts が declare module で足す） */
export interface CoreFeatureMethods {}
export interface HostFeatureMethods {}
export interface CoreFeatureEvents {}

/** メイン → コアの呼び出し */
export type CoreMethods = BaseCoreMethods & CoreFeatureMethods;
/** コア → メインの呼び出し（DB ワーカーと、機能の分 = 埋め込みブラウザの操作・キーチェーンの鍵） */
export type HostMethods = Prefixed<"dbWorker", DbWorkerSpawner> & HostFeatureMethods;
/** コア → メインの返事のない知らせ */
export type CoreEvents = BaseCoreEvents & CoreFeatureEvents;
/** メイン → コアの返事のない知らせ */
export interface HostEvents {
  "dbWorker.exit": { workerId: number; reason: string };
}

/**
 * 呼び出しの時間の上限。ping は見張り・runningChats はコアが詰まっていても終えられるように・close は終了の 5 秒に収める・browser は中の待ちの外側の安全網・
 * secret と diagnostics はキーチェーンの許可の画面と記録の 10 秒を待つ
 */
export const RPC_TIMEOUTS = {
  default: 30_000,
  ping: 5_000,
  runningChats: 1_000,
  close: 4_500,
  "browser.*": 120_000,
  "dbWorker.*": 10_000,
  "secret.*": null,
  "diagnostics.*": null,
} as const satisfies TimeoutTable<CoreMethods & HostMethods>;
