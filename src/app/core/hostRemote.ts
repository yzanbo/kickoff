// RPC の上に作る、メインプロセスにしかない口（コアのプロセスの中で startCore に渡す）: 埋め込みブラウザの操作・キーチェーンの鍵・
// Mac の通知・DB ワーカー（作るのはメイン、話すのはコア。メインが作った MessagePort で直結する）。
// 機能の呼び出し・知らせの形は、下の declare module で土台の表（@/foundation/core/host/protocol.ts）に足す（メインも同じ形を読む）
import { BROWSER_METHODS, type BrowserControl } from "@shared/browser/control";
import type { WorkerChannel } from "@/features/database/core/index";
import type { WorkerCancel, WorkerEvent, WorkerRequest, WorkerResponse } from "@shared/database/workerProtocol";
import type { Notice } from "@shared/foundation/ipc/notifications";
import type { DesktopNotify } from "@/features/notifications/core/index";
import { SECRET_METHODS, type SecretCipher } from "@/foundation/core/system/sealedSecret";
import { shellPathSettled } from "@/foundation/core/system/exec";
import { errorMessage } from "@shared/foundation/errors";
import { prefixedClient, type Prefixed } from "@/foundation/core/host/protocol";
import type { RpcPort } from "@/foundation/core/host/ports";
import type { HostRpc } from "@/foundation/core/host/rpc";

declare module "@/foundation/core/host/protocol" {
  /** メイン → コア: 診断の記録（10 秒）と、消えた画面のシェルを止める */
  interface CoreFeatureMethods
    extends Prefixed<"diagnostics", { start(): Promise<void>; stop(): Promise<CoreDiagnostics> }>,
      Prefixed<"terminal", { closeOwnedBy(owner: string): Promise<void> }> {}
  /** コア → メイン: 埋め込みブラウザの操作とキーチェーンの鍵 */
  interface HostFeatureMethods extends Prefixed<"browser", Omit<BrowserControl, "touch">>, Prefixed<"secret", SecretCipher> {}
  /** コア → メインの知らせ: Mac の通知と、AI が操作したタブの印 */
  interface CoreFeatureEvents {
    notify: Notice;
    "browser.touch": number;
  }
}

/** 埋め込みブラウザの操作をメインへ写す（失敗の文はそのまま AI に返る。touch は返事のない知らせ） */
export const remoteBrowser = (rpc: HostRpc): BrowserControl => prefixedClient<BrowserControl>(rpc, "browser", BROWSER_METHODS, { emit: ["touch"] });

/** DB のパスワード・AI の API キーの暗号化（safeStorage はメインだけ。キーチェーンの許可の画面を待つので時間の上限なし） */
export const remoteCipher = (rpc: HostRpc): SecretCipher => prefixedClient<SecretCipher>(rpc, "secret", SECRET_METHODS);

/** Mac の通知（出すかはコアが決め、出すのはメイン。返事なし） */
export function remoteNotify(rpc: HostRpc): DesktopNotify {
  return (notice) => rpc.emit("notify", notice);
}

/** MessagePort（Electron の MessagePortMain・Node の MessagePort）のうち使う所 */
interface WorkerPortLike {
  on(event: "message", fn: (e: unknown) => void): void;
  postMessage(message: unknown): void;
  start?(): void;
  close?(): void;
}

/** 届いたものの中身（Electron の MessagePortMain は { data }、Node の MessagePort はそのまま） */
const dataOf = (e: unknown): unknown => (typeof e === "object" && e !== null && "data" in e ? (e as { data: unknown }).data : e);

/** 文字の値だけの環境変数（DB ワーカーに渡す。ログインシェルの PATH を含む） */
export function stringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => typeof e[1] === "string"));
}

/**
 * DB ワーカーを作る口（startCore の dbWorker）。メインに dbWorker.spawn を頼み（PATH を読み直し終えてから、そのときの process.env を渡す）、
 * 親の口に { t: "port", workerId } と一緒に届く MessagePort で話す。口が届く前に送ったものはためておき、届いたら順に送る
 */
export function hostDbWorker(rpc: HostRpc, parent: RpcPort, opts: { env?: () => NodeJS.ProcessEnv } = {}): () => WorkerChannel {
  /** 番号の分かる前に届いた口 */
  const ports = new Map<number, WorkerPortLike>();
  const waiting = new Map<number, (port: WorkerPortLike) => void>();
  parent.onMessage((m, transfer) => {
    const msg = m as { t?: unknown; purpose?: unknown; workerId?: unknown };
    if (msg.t !== "port" || msg.purpose !== "dbWorker" || typeof msg.workerId !== "number") return;
    const port = transfer[0] as WorkerPortLike | undefined;
    if (!port) return;
    const take = waiting.get(msg.workerId);
    if (take) {
      waiting.delete(msg.workerId);
      take(port);
    } else ports.set(msg.workerId, port);
  });
  const portOf = (id: number) =>
    new Promise<WorkerPortLike>((resolve) => {
      const port = ports.get(id);
      if (port) {
        ports.delete(id);
        resolve(port);
      } else waiting.set(id, resolve);
    });

  return () => {
    const queue: (WorkerRequest | WorkerCancel)[] = [];
    const messageFns: ((m: WorkerResponse | WorkerEvent) => void)[] = [];
    const exitFns: ((reason: string) => void)[] = [];
    let port: WorkerPortLike | null = null;
    let workerId: number | null = null;
    let killed = false;
    let exited = false;
    const exit = (reason: string) => {
      if (killed || exited) return;
      exited = true;
      for (const fn of exitFns) fn(reason);
    };
    const offExit = rpc.on("dbWorker.exit", ({ workerId: id, reason }) => {
      if (id !== workerId) return;
      offExit();
      exit(reason);
    });
    void (async () => {
      try {
        await shellPathSettled();
        const id = await rpc.call("dbWorker.spawn", stringEnv((opts.env ?? (() => process.env))()));
        workerId = id;
        if (killed) return void rpc.call("dbWorker.kill", id).catch(() => {});
        const p = await portOf(id);
        if (killed) return p.close?.();
        port = p;
        p.on("message", (e) => {
          const data = dataOf(e) as WorkerResponse | WorkerEvent;
          for (const fn of messageFns) fn(data);
        });
        p.start?.();
        for (const message of queue.splice(0)) p.postMessage(message);
      } catch (e) {
        offExit();
        exit(`DB ワーカーを起動できません（${errorMessage(e)}）`);
      }
    })();
    return {
      send: (message) => {
        if (port) port.postMessage(message);
        else queue.push(message);
      },
      onMessage: (fn) => void messageFns.push(fn),
      onExit: (fn) => void exitFns.push(fn),
      kill: () => {
        if (killed) return;
        killed = true;
        offExit();
        port?.close?.();
        // JS の受け口は使わない（SQLite の文を流している間は動けず、止められなくなる）。メインが utilityProcess を OS で止める
        if (workerId !== null) void rpc.call("dbWorker.kill", workerId).catch(() => {});
      },
    };
  };
}
