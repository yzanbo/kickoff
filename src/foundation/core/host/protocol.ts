// メインプロセスとコアのプロセス（utilityProcess）のやり取りの形（型だけ。Electron に依らない。メインも読む）。
// 口は utilityProcess の parentPort 1 本で、呼ぶ・答える・知らせる（RpcMessage）と、起動の init / ready / failed、DB ワーカーの port を運ぶ
import type { BrowserTabInfo, HistoryAction, PageImage, PageSnapshot, RevealRequest } from "@shared/browser/control";
import type { Notice } from "@/features/notifications/core/notices";
import type { StallRecord } from "@/foundation/core/system/stallWatch";

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

/** メイン → コアの呼び出し */
export interface CoreMethods {
  /** 片付けて終わる（答えたあと、コアは自分で終わる） */
  close(): Promise<void>;
  /** 応答の見張り（コアの時刻を返す） */
  ping(): Promise<number>;
  "diagnostics.start"(): Promise<void>;
  "diagnostics.stop"(): Promise<CoreDiagnostics>;
  /** その持ち主（この Mac の画面 wc:<ID>）のシェルを止める（画面が消えた・読み込み直した） */
  "terminal.closeOwnedBy"(owner: string): Promise<void>;
  /** 作業中のチャット（終了してよいかを聞くダイアログに名前を並べる） */
  runningChats(): Promise<{ id: number; title: string | null }[]>;
  /** コアのプロセスのメモリ（60 秒ごとの metrics.jsonl） */
  metrics(): Promise<{ heapUsedMB: number; rssMB: number }>;
}

/** コア → メインの呼び出し（埋め込みブラウザの操作・キーチェーンの鍵・DB ワーカーを作る） */
export interface HostMethods {
  "browser.tabs"(): Promise<BrowserTabInfo[]>;
  "browser.open"(projectId: number, url: string, reveal: RevealRequest | null): Promise<{ tab: BrowserTabInfo; revealed: boolean }>;
  "browser.reveal"(tabId: number, request: RevealRequest): Promise<boolean>;
  "browser.navigate"(tabId: number, url: string): Promise<BrowserTabInfo>;
  "browser.history"(tabId: number, action: HistoryAction): Promise<BrowserTabInfo>;
  "browser.read"(tabId: number): Promise<PageSnapshot>;
  "browser.screenshot"(tabId: number): Promise<PageImage>;
  "browser.click"(tabId: number, ref: number): Promise<string>;
  "browser.type"(tabId: number, ref: number, text: string, submit: boolean): Promise<string>;
  "browser.press"(tabId: number, key: string): Promise<string>;
  "browser.scroll"(tabId: number, direction: "up" | "down" | "top" | "bottom"): Promise<string>;
  "browser.evaluate"(tabId: number, script: string): Promise<string>;
  "browser.consoleLogs"(tabId: number): Promise<string[]>;
  "secret.encrypt"(plain: string): Promise<string>;
  "secret.decrypt"(sealed: string): Promise<string>;
  /** DB ワーカーを作る（env はコアの process.env = 読み込んだログインシェルの PATH を含む）。番号を返し、MessagePort を { t: "port" } で送る */
  "dbWorker.spawn"(env: Record<string, string>): Promise<number>;
  "dbWorker.kill"(workerId: number): Promise<void>;
}

/** コアが起こした子プロセス（コアが落ちたときにメインが止める。group はプロセスグループの頭か） */
export interface ChildProcessNote {
  pid: number;
  group: boolean;
  kind: "agent" | "dbWorkerChild";
  state: "started" | "exited";
}

/** 眠らせない理由（作業中の数とスマホ連携のオン・オフ。変わったときだけ） */
export interface AwakeNeeds {
  running: number;
  mobileEnabled: boolean;
}

/** コア → メインの返事のない知らせ */
export interface CoreEvents {
  notify: Notice;
  awake: AwakeNeeds;
  "browser.touch": number;
  stall: StallRecord;
  children: ChildProcessNote;
}

/** メイン → コアの返事のない知らせ */
export interface HostEvents {
  "dbWorker.exit": { workerId: number; reason: string };
}

/** 呼び出しの時間の上限（ms。null は上限なし）。ping は見張り・runningChats はコアが詰まっていても終えられるように・close は終了の 5 秒に収める・browser は中の待ちの外側の安全網・secret と diagnostics はキーチェーンの許可の画面と記録の 10 秒を待つ */
export function rpcTimeoutOf(method: string): number | null {
  if (method === "ping") return 5_000;
  if (method === "runningChats") return 1_000;
  if (method === "close") return 4_500;
  if (method.startsWith("browser.")) return 120_000;
  if (method.startsWith("dbWorker.")) return 10_000;
  if (method.startsWith("secret.") || method.startsWith("diagnostics.")) return null;
  return 30_000;
}
