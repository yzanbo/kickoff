import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from "electron";
import type { z } from "zod";
import { eventChannelOf, ipcEntries, type InvokeSpec, type IpcArgs, type IpcGroup, type IpcMethodOf, type IpcSpec, type IpcTable, type SendSpec } from "@shared/foundation/ipc";
import { timed } from "@/foundation/core/system/stallWatch";
import { sameOrigin } from "@/foundation/desktop/app/urls";

// IPC の取り決め（@shared/foundation/ipc の表。全部を並べた NATIVE_API は src/app/shared/ipc.ts）どおりに、メインの処理を登録し、画面へ知らせる。
// Electron の実体は使わない（ipcMain は渡してもらう。テストでは偽物を渡す）

/** 画面から届くもの（invoke・send）の名前 */
type CallMethod<G extends IpcGroup> = IpcMethodOf<G, "invoke" | "send">;
/** メインから画面への知らせ（event）の名前 */
type EventMethod<G extends IpcGroup> = IpcMethodOf<G, "event">;
type CallArgs<G extends IpcGroup, M extends CallMethod<G>> = IpcArgs<IpcSpec<G, M>>;

/** 引数の形（zod）。通したあとの形は取り決めの引数と同じ */
export type IpcArgSchemas = { [G in IpcGroup]: { [M in CallMethod<G>]: z.ZodType<CallArgs<G, M>, CallArgs<G, M>> } };

/** 表のまとまりの中の、画面から届くもの（invoke・send）の名前 */
type CallKeys<X> = { [M in keyof X]: X[M] extends { kind: "invoke" | "send" } ? M : never }[keyof X];
/** 表 T の引数の形（zod）の表の形（土台・機能の argSchemas が satisfies で書く） */
export type ArgSchemasFor<T extends IpcTable> = { [G in keyof T]: { [M in CallKeys<T[G]>]: z.ZodType<IpcArgs<T[G][M]>, IpcArgs<T[G][M]>> } };
/** 表 T の、画面から届くものの引数の表 */
export type ArgsOfTable<T extends IpcTable> = { [G in keyof T]: { [M in CallKeys<T[G]>]: IpcArgs<T[G][M]> } };
/** 引数の形（zod）の表の、受け取る形（input）の表（ArgsOfTable と Same で比べる: 狭いと画面から届く正しい値を断り、広いと型が合わない） */
export type ZodArgsOf<S> = { [G in keyof S]: { [M in keyof S[G]]: S[G][M] extends z.ZodType ? z.input<S[G][M]> : never } };

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
  { table, schemas, handlers, trusted, warn = (message) => console.warn(message) }: {
    table: IpcTable;
    schemas: IpcArgSchemas;
    handlers: IpcHandlers;
    trusted: (event: Sender) => boolean;
    warn?: (message: string) => void;
  },
) {
  const schemaTable = schemas as unknown as Record<string, Record<string, z.ZodType<unknown[]>>>;
  const handlerTable = handlers as unknown as Record<string, Record<string, (event: unknown, ...args: unknown[]) => unknown>>;
  for (const { group, method, kind, channel } of ipcEntries(table)) {
    if (kind === "event") continue;
    const schema = schemaTable[group]?.[method];
    // 部品の並べ忘れは起動のときに分かるようにする
    if (!schema || !handlerTable[group]?.[method]) throw new Error(`${channel}: 引数の形か処理がありません（部品の並べ忘れ）`);
    // 処理の同期の分に名前を付けて、詰まりの見張りに知らせる（core/system/stallWatch.ts）
    const handler = timed(`ipc:${group}.${method}`, handlerTable[group][method]);
    /** 通すなら引数を、断るなら書き残してその理由を返す */
    const accept = (event: Sender, raw: unknown[]): { args: unknown[] } | { rejected: IpcRejected } => {
      const parsed = trusted(event) ? schema.safeParse(raw) : undefined;
      if (parsed?.success) return { args: parsed.data };
      const rejected = new IpcRejected(
        parsed ? `${channel}: 引数が正しくありません（${describeIssues(parsed.error)}）` : `${channel}: Kickoff の画面以外からの呼び出しは受け付けません`,
      );
      warn(`[ipc] ${rejected.message}`);
      return { rejected };
    };
    if (kind === "invoke") {
      ipc.handle(channel, (event, ...raw) => {
        const accepted = accept(event, raw);
        if ("rejected" in accepted) throw accepted.rejected;
        return handler(event, ...accepted.args);
      });
    } else {
      ipc.on(channel, (event, ...raw) => {
        const accepted = accept(event, raw);
        if ("args" in accepted) handler(event, ...accepted.args);
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
  if (target && !target.isDestroyed()) target.send(eventChannelOf(group, method), ...args);
}
