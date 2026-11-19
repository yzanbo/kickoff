// 取り決め（@shared/foundation/contract）の受け口を書く: 本文・クエリの zod と取り決めの型が同じかを型検査で確かめ、
// パスの引数の引き当て（文脈）と受け口の中身をまとめて、mount.ts が Hono に登録できる形にする
import type { Context } from "hono";
import type { SSEStreamingApi } from "hono/streaming";
import type { WSEvents } from "hono/ws";
import type { z } from "zod";
import type { BodyOf, Contract, ParamNames, PathOf, QueryOf, ResOf, RouteKey, RouteSpec, Same } from "@shared/foundation/contract";
import { NotFound } from "@/foundation/core/errors";
import type { Caller } from "./caller";
import type { FileReply } from "./fileReply";
import { parseId } from "./input";

/** パスの引数 1 つの引き当て（なければ parse が NotFound を投げる） */
export interface Param<T> {
  readonly parse: (raw: string) => T | Promise<T>;
  /** 受け口の全体（待ちのあとも）を包む */
  readonly around?: (value: T, run: () => Promise<Response>) => Promise<Response>;
}

/** 正の整数の ID を引く（番号でなければ 400「ID の指定が正しくありません」、なければ 404） */
export function idParam<T>(find: (id: number) => T | undefined, notFound: string): Param<T> {
  return {
    parse: (raw) => {
      const found = find(parseId(raw));
      if (found === undefined) throw new NotFound(notFound);
      return found;
    },
  };
}

/** 文字の ID を形で確かめて引く（形が違えば 400。find を渡せば、なければ 404） */
export function textParam<T = string>(schema: z.ZodType<string>, find?: (raw: string) => T | undefined, notFound = "見つかりません"): Param<T> {
  return {
    parse: (raw) => {
      const value = schema.parse(raw);
      if (!find) return value as T;
      const found = find(value);
      if (found === undefined) throw new NotFound(notFound);
      return found;
    },
  };
}

/** 知らせの流れの受け口（流し終えるか切られるまで待つ） */
export type SseHandler = (stream: SSEStreamingApi) => Promise<void>;
/** WebSocket の受け口 */
export type WsHandler = WSEvents;
/** 受け口が返すもの: json は応答の値（204 は undefined）・blob は FileReply・sse は SseHandler・ws は WsHandler・raw は Response */
export type Reply<S> = S extends { readonly kind: "blob" }
  ? FileReply
  : S extends { readonly kind: "sse" }
    ? SseHandler
    : S extends { readonly kind: "ws" }
      ? WsHandler
      : S extends { readonly kind: "raw" }
        ? Response
        : ResOf<S>;

type Out<Z> = Z extends z.ZodType ? z.output<Z> : never;
/** 取り決めのパスの引数の名前（全部のルートを合わせたもの） */
type ParamsOf<C extends Contract> = { [K in RouteKey<C>]: ParamNames<PathOf<K>> }[RouteKey<C>];

/** 受け口が受け取るもの（検証済み・引き当て済み）。workdir は取り決めに workdir: true のあるルートだけ読める */
export type HandlerCtx<K, Zb, Zq, Ctx> = { [N in ParamNames<PathOf<K & string>>]: N extends keyof Ctx ? Ctx[N] : never } & {
  body: Out<Zb>;
  query: Out<Zq>;
  readonly caller: Caller;
  readonly workdir: string;
  raw: Context;
};

type Entry<K, Zb, Zq, R, Ctx> = {
  /** 本文の zod（入力の形が取り決めの本文と両向きに同じでなければ型の失敗） */
  body?: Zb;
  /** クエリの zod（通したあとの形が取り決めのクエリと同じか。クエリは文字で届くので入力の形は比べない） */
  query?: Zq;
  run: (ctx: HandlerCtx<K, Zb, Zq, Ctx>) => R | Promise<R>;
};

/** 取り決めと zod の一致の確かめ（違えば、その印が型の失敗に出る） */
type Exact<C extends Contract, Eb, Eq> = {
  [K in RouteKey<C>]: K extends keyof Eb
    ? ([Eb[K]] extends [z.ZodType]
        ? Same<z.input<Eb[K]>, BodyOf<C[K]>> extends true
          ? unknown
          : { 取り決めの本文と形が違います: K }
        : [BodyOf<C[K]>] extends [never]
          ? unknown
          : { 本文の形がありません: K }) &
        (K extends keyof Eq
          ? [Eq[K]] extends [z.ZodType]
            ? Same<z.output<Eq[K]>, QueryOf<C[K]>> extends true
              ? unknown
              : { 取り決めのクエリと形が違います: K }
            : [QueryOf<C[K]>] extends [never]
              ? unknown
              : { クエリの形がありません: K }
          : unknown)
    : { 受け口がありません: K };
};

/** mount.ts が登録する 1 本 */
export interface MountEntry {
  readonly key: string;
  readonly spec: RouteSpec<unknown, unknown, unknown>;
  readonly body?: z.ZodType;
  readonly query?: z.ZodType;
  readonly run: (ctx: Record<string, unknown>) => unknown;
}

/** 取り決めの受け口の束（CoreFeature.routes に並べる） */
export interface ImplementedRoutes {
  readonly contract: Contract;
  readonly context: Readonly<Record<string, Param<unknown>>>;
  readonly entries: readonly MountEntry[];
}

/**
 * 取り決めの全部のルートの受け口を書く。context にパスの引数ごとの Param、ルートのキーごとに { body?, query?, run }。
 * 受け口のないルート・取り決めにない受け口・zod と取り決めの形の違い・応答の型の違いは型検査で落ちる
 */
export function implement<C extends Contract, Eb, Eq, Ctx extends Record<ParamsOf<C>, unknown>>(
  contract: C,
  spec: { context: { [N in keyof Ctx]: Param<Ctx[N]> } } & {
    [K in keyof Eb]: K extends "context" ? unknown : Entry<K, Eb[K], K extends keyof Eq ? Eq[K] : never, K extends keyof C ? Reply<C[K]> : never, Ctx>;
  } & { [K in keyof Eq]: K extends "context" ? unknown : { query?: Eq[K] } } & Exact<C, Eb, Eq>,
): ImplementedRoutes {
  const { context, ...entries } = spec as unknown as { context: Record<string, Param<unknown>> } & Record<string, Omit<MountEntry, "key" | "spec">>;
  return {
    contract,
    context,
    entries: Object.entries(entries).map(([key, entry]) => {
      const routeSpec = contract[key as RouteKey<C>];
      if (!routeSpec) throw new Error(`取り決めにない受け口です: ${key}`);
      return { key, spec: routeSpec, ...entry };
    }),
  };
}
