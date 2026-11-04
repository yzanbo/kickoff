import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from "electron";
import type { z } from "zod";
import { errorMessage } from "@shared/errors";
import { channelOf, ipcEntries, type InvokeSpec, type IpcArgs, type IpcGroup, type IpcMethodOf, type IpcSpec, type SendSpec } from "@shared/ipc";
import { sameOrigin } from "../app/urls.js";

// IPC の取り決め（shared/ipc/contract.ts）どおりに、メインの処理を登録し、画面へ知らせる。
// Electron の実体は使わない（ipcMain は渡してもらう。テストでは偽物を渡す）

/** 画面から届くもの（invoke・send）の名前 */
type CallMethod<G extends IpcGroup> = IpcMethodOf<G, "invoke" | "send">;
/** メインから画面への知らせ（event）の名前 */
type EventMethod<G extends IpcGroup> = IpcMethodOf<G, "event">;
type CallArgs<G extends IpcGroup, M extends CallMethod<G>> = IpcArgs<IpcSpec<G, M>>;

/** 引数の形（zod）。通したあとの形は取り決めの引数と同じ */
export type IpcArgSchemas = { [G in IpcGroup]: { [M in CallMethod<G>]: z.ZodType<CallArgs<G, M>, CallArgs<G, M>> } };

type Same<X, Y> = [X] extends [Y] ? ([Y] extends [X] ? true : false) : false;
/** 受け取る形（input）が取り決めの引数と同じでないものに印を付ける（狭いと画面から届く正しい値を断り、広いと型が合わない） */
type ExactArgs<T extends IpcArgSchemas> = {
  [G in IpcGroup]: {
    [M in CallMethod<G>]: M extends keyof T[G] ? (Same<z.input<T[G][M]>, CallArgs<G, M>> extends true ? unknown : { 取り決めの引数と形が違います: `${G}.${M}` }) : never;
  };
};

/** 引数の形の一覧を定める（取り決めの引数と形が違えば、その名前が typecheck の失敗に出る） */
export function defineArgSchemas<T extends IpcArgSchemas>(schemas: T & ExactArgs<T>): T {
  return schemas;
}

/** 処理: invoke は戻り値（Promise でもよい）を返し、send は何も返さない。event は送り手（e.sender など）を見るために渡す */
type HandlerOf<S> =
  S extends InvokeSpec<infer A, infer R>
    ? (event: IpcMainInvokeEvent, ...args: A) => R | Promise<R>
    : S extends SendSpec<infer A>
      ? (event: IpcMainEvent, ...args: A) => void
      : never;

/** 画面から届くもの（invoke・send）すべての処理。まとまりごとに、その機能のフォルダで作る */
export type IpcHandlers = { [G in IpcGroup]: { [M in CallMethod<G>]: HandlerOf<IpcSpec<G, M>> } };

/** メインの ipcMain の口 */
export interface MainIpc {
  handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void;
  on(channel: string, listener: (event: IpcMainEvent, ...args: unknown[]) => void): unknown;
}

/** 送り手の確かめに使う、届いたものの一部 */
type Sender = Pick<IpcMainEvent, "senderFrame">;

/** 送り手が Kickoff の画面か（画面を読み込んだ URL と同じ出どころの枠から届いたもの。消えた枠からのものは断る） */
export const fromApp =
  (appUrl: string) =>
  (event: Sender): boolean =>
    sameOrigin(event.senderFrame?.url ?? "", appUrl);

/** 取り決めに合わない呼び出し（送り手が Kickoff の画面でない・引数の形が違う） */
export class IpcRejected extends Error {}

const describeIssues = (error: z.ZodError) => error.issues.map((i) => `${i.path.length > 0 ? `${i.path.join(".")}: ` : ""}${i.message}`).join(" / ");

/**
 * 取り決めの表の invoke・send をすべて登録する。どれも同じ扱いにする: 送り手が Kickoff の画面でなければ断り、
 * 引数を zod で確かめて、通したものだけを処理に渡す。断ったときは書き残し、invoke は失敗（IpcRejected）を返し、send は捨てる
 */
export function registerIpcHandlers(
  ipc: MainIpc,
  { schemas, handlers, trusted, warn = (message) => console.warn(message) }: {
    schemas: IpcArgSchemas;
    handlers: IpcHandlers;
    trusted: (event: Sender) => boolean;
    warn?: (message: string) => void;
  },
) {
  const schemaTable = schemas as unknown as Record<string, Record<string, z.ZodType<unknown[]>>>;
  const handlerTable = handlers as unknown as Record<string, Record<string, (event: unknown, ...args: unknown[]) => unknown>>;
  for (const { group, method, kind, channel } of ipcEntries()) {
    if (kind === "event") continue;
    const schema = schemaTable[group][method];
    const handler = handlerTable[group][method];
    const accept = (event: Sender, raw: unknown[]): unknown[] => {
      if (!trusted(event)) throw new IpcRejected(`${channel}: Kickoff の画面以外からの呼び出しは受け付けません`);
      const parsed = schema.safeParse(raw);
      if (!parsed.success) throw new IpcRejected(`${channel}: 引数が正しくありません（${describeIssues(parsed.error)}）`);
      return parsed.data;
    };
    const reject = (e: unknown) => {
      warn(`[ipc] ${errorMessage(e)}`);
      return e;
    };
    if (kind === "invoke") {
      ipc.handle(channel, (event, ...raw) => {
        let args: unknown[];
        try {
          args = accept(event, raw);
        } catch (e) {
          throw reject(e);
        }
        return handler(event, ...args);
      });
    } else {
      ipc.on(channel, (event, ...raw) => {
        let args: unknown[];
        try {
          args = accept(event, raw);
        } catch (e) {
          reject(e);
          return;
        }
        handler(event, ...args);
      });
    }
  }
}

/** メインから画面へ知らせる（画面がなければ・閉じていれば何もしない） */
export function sendEvent<G extends IpcGroup, M extends EventMethod<G>>(
  target: Pick<WebContents, "send" | "isDestroyed"> | undefined,
  group: G,
  method: M,
  ...args: IpcArgs<IpcSpec<G, M>>
) {
  if (target && !target.isDestroyed()) target.send(channelOf(group, method), ...args);
}
