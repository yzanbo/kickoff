// HTTP の取り決めの表の部品（純粋。zod を読まない）。機能は src/shared/<機能>/contract.ts に「"メソッド パス": route<本文, 応答>()」の表を書き、
// コアは implement で受け口を、画面・スマホ・テストは createClient で呼び手を作る
import type { types } from "./phantom";

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
/**
 * json = JSON を受けて JSON / 204 を返す。form = multipart を受ける。blob = バイナリを返す。sse = 知らせの流れ。ws = WebSocket。
 * raw = 表に乗らない受け口（受け口が Response を返し、呼ぶ側は url だけ）
 */
export type RouteKind = "json" | "form" | "blob" | "sse" | "ws" | "raw";
/** だれに開くか（省けば「この Mac だけ」）。public = 認証の外。device = 端末（見るだけの端末は GET だけ）。deviceRead = 見るだけの端末も使える（GET 以外でも） */
export type Access = "public" | "device" | "deviceRead";
type SuccessStatus = 200 | 201 | 202 | 204;

export interface RouteSpec<B = never, R = unknown, Q = never, K extends RouteKind = RouteKind> {
  readonly kind: K;
  readonly status: SuccessStatus;
  /** 成功の状態コードがもう 1 つある（受け口が undefined を返したか useAlsoStatus を呼んだときの状態コード。undefined を返すなら応答の型 R に | undefined を書く） */
  readonly alsoStatus?: SuccessStatus;
  readonly access?: Access;
  /** ?worktree= を作業場所に解く（パスに :projectId があるルートだけ） */
  readonly workdir?: true;
  /** そのルートだけの印（コアの受け口の登録は読まない。機能と画面の呼び手が読む） */
  readonly marks?: Readonly<Record<string, true>>;
  readonly [types]?: { body: B; res: R; query: Q };
}

/** 作業場所のルート（workdir: true）のクエリ（ワークツリーの作業するフォルダ。省けば本体。コアは mount が作業場所に解く） */
export interface WorkdirQuery {
  worktree?: string;
}

type Opts = { status?: 200 | 201 | 202; alsoStatus?: SuccessStatus; access?: Access; workdir?: true; marks?: Readonly<Record<string, true>> };
type Extra = Pick<RouteSpec, "alsoStatus" | "access" | "workdir" | "marks">;

/** 書いた選択肢だけを写す（書いていない項目を undefined で持たない） */
function extra({ alsoStatus, access, workdir, marks }: Opts): Extra {
  return { ...(alsoStatus ? { alsoStatus } : {}), ...(access ? { access } : {}), ...(workdir ? { workdir } : {}), ...(marks ? { marks } : {}) };
}

/** JSON を返す（既定 200） */
export const route = <B = never, R = unknown, Q = never>(opts: Opts = {}): RouteSpec<NoInfer<B>, NoInfer<R>, NoInfer<Q>, "json"> => ({ kind: "json", status: opts.status ?? 200, ...extra(opts) });
// 型の引数は文脈（satisfies Contract）から推論させない（省いた本文・クエリが any にならず never のままになるように）

/** 返すものがない（204） */
export const empty = <B = never, Q = never>(opts: Omit<Opts, "status"> = {}): RouteSpec<NoInfer<B>, void, NoInfer<Q>, "json"> => ({ kind: "json", status: 204, ...extra(opts) });
/** バイナリを返す（呼ぶ側は Blob か URL） */
export const blob = <Q = never, B = never>(opts: Omit<Opts, "status"> = {}): RouteSpec<NoInfer<B>, BlobReply, NoInfer<Q>, "blob"> => ({ kind: "blob", status: 200, ...extra(opts) });
/** multipart を受ける（呼ぶ側は FormData） */
export const form = <R, Q = never>(opts: Opts = {}): RouteSpec<FormBody, NoInfer<R>, NoInfer<Q>, "form"> => ({ kind: "form", status: opts.status ?? 200, ...extra(opts) });
/** 知らせの流れ（E = data の型） */
export const sse = <E, Q = never>(opts: Omit<Opts, "status"> = {}): RouteSpec<never, SseOf<NoInfer<E>>, NoInfer<Q>, "sse"> => ({ kind: "sse", status: 200, ...extra(opts) });
/** WebSocket（In = 相手 → コア、Out = コア → 相手） */
export const ws = <In, Out, Q = never>(opts: Omit<Opts, "status"> = {}): RouteSpec<never, WsOf<NoInfer<In>, NoInfer<Out>>, NoInfer<Q>, "ws"> => ({ kind: "ws", status: 200, ...extra(opts) });
/** 表に乗らない受け口（受け口が Response をそのまま返す。呼ぶ側は url だけ） */
export const raw = <Q = never>(opts: Omit<Opts, "status"> = {}): RouteSpec<never, never, NoInfer<Q>, "raw"> => ({ kind: "raw", status: 200, ...extra(opts) });

/** 環境の型（Blob・File・Buffer）を書かないための印 */
export interface BlobReply {
  readonly __blob: true;
}
export interface FormBody {
  readonly __form: true;
}
export interface SseOf<E> {
  readonly __sse: E;
}
export interface WsOf<In, Out> {
  readonly __ws: [In, Out];
}

/** 取り決め = 「メソッド パス」の文字をキーにした表（パスの引数は :projectId などの意味のある名前。URL は変わらない） */
export type Contract = { readonly [K in `${Method} /${string}`]?: RouteSpec<any, any, any, RouteKind> };
/** その取り決めのキー（C を省けばすべての「メソッド パス」） */
export type RouteKey<C extends Contract = Contract> = keyof C & `${Method} /${string}`;
export type PathOf<K extends string> = K extends `${Method} ${infer P}` ? P : never;
/** パスの引数の名前（"/api/chats/:chatId/queue/:queueId" → "chatId" | "queueId"。* は "*"） */
export type ParamNames<P extends string> = P extends `${string}:${infer N}/${infer Rest}`
  ? N | ParamNames<`/${Rest}`>
  : P extends `${string}:${infer N}`
    ? N
    : P extends `${string}/*`
      ? "*"
      : never;
export type BodyOf<S> = S extends { readonly [types]?: { body: infer B } } ? B : never;
export type ResOf<S> = S extends { readonly [types]?: { res: infer R } } ? R : never;
export type QueryOf<S> = S extends { readonly [types]?: { query: infer Q } } ? Q : never;

/** ない項目（never）を外す */
type Present<T> = { [K in keyof T as [T[K]] extends [never] ? never : K]: T[K] };
/** 中身がすべて省ける項目（クエリなど）は、項目ごと省ける */
type Loosen<T> = { [K in keyof T as {} extends T[K] ? K : never]?: T[K] } & { [K in keyof T as {} extends T[K] ? never : K]: T[K] };
type Params<K extends string> = [ParamNames<PathOf<K>>] extends [never] ? never : Record<ParamNames<PathOf<K>>, string | number>;
/** 呼ぶ側の入力 { params?, query?, body? }（あるものだけ。入力がなければ undefined）。呼び出しの形は 1 つ: 呼び出し(キー, { params, query, body }, 選択肢) */
export type RouteInput<C extends Contract, K extends RouteKey<C>> =
  keyof Present<{ params: Params<K>; query: QueryOf<C[K]>; body: BodyOf<C[K]> }> extends never
    ? undefined
    : Loosen<Present<{ params: Params<K>; query: QueryOf<C[K]>; body: BodyOf<C[K]> }>>;
/** 応答の型（json は R・204 は undefined。blob は BlobAs（既定は印の BlobReply。画面は Blob などを入れる）） */
export type RouteOutput<C extends Contract, K extends RouteKey<C>, BlobAs = BlobReply> = C[K] extends { readonly kind: "blob" } ? BlobAs : ResOf<C[K]>;

/** キーをメソッドとパスに分ける */
export function splitKey(key: string): { method: Method; path: string } {
  const space = key.indexOf(" ");
  return { method: key.slice(0, space) as Method, path: key.slice(space + 1) };
}
