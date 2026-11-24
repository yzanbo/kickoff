// SSE の種類の表の部品（純粋）。機能は src/shared/<機能>/events.ts に「種類: event<中身>()」の表を書き、
// declare module で ServerEventMap に足す（土台・画面の土台・スマホが app を読まずに、全部の種類の型を引ける）
import type { types } from "./phantom";

export interface EventSpec<P> {
  /** device = 端末（スマホ）にも届ける（省けばこの Mac の画面だけ） */
  readonly access?: "device";
  readonly [types]?: P;
}

/** 種類 1 つ（P = type のほかの中身。型の引数は表の型から推論させない） */
export const event = <P>(opts: { access?: "device" } = {}): EventSpec<NoInfer<P>> => (opts.access ? { access: opts.access } : {});

export type EventTable = { readonly [type: string]: EventSpec<unknown> };
/** 表 → 種類ごとの知らせの型（{ snippet: { type: "snippet"; snippet: Snippet }, … }） */
export type EventsOf<T extends EventTable> = { [K in keyof T & string]: { type: K } & (T[K] extends EventSpec<infer P> ? P : never) };

/** 全部の機能の SSE の種類の表。土台は空で宣言し、各機能の src/shared/<機能>/events.ts が declare module で足す */
export interface ServerEventMap {}
/** サーバーからクライアントへ配信する知らせ（SSE） */
export type BusEvent = ServerEventMap[keyof ServerEventMap];

/** コアのバスに流す知らせ（chat_delta の書きかけの文の中の位置 offset は、バスが配るときに付ける） */
export type BusInput = Exclude<BusEvent, { type: "chat_delta" }> | Omit<Extract<BusEvent, { type: "chat_delta" }>, "offset">;

/** 端末に届けてよい種類（値の表の access から作る） */
export function deviceEventTypes(tables: readonly EventTable[]): ReadonlySet<string> {
  return new Set(tables.flatMap((table) => Object.entries(table).flatMap(([type, spec]) => (spec.access === "device" ? [type] : []))));
}
