// 受け口を Hono に登録する: 取り決めの受け口（implement.ts）は、パスの引数の引き当て・作業場所・本文とクエリの検証・応答の形を
// ここでまとめて行う。まだ取り決めに乗せていない受け口（legacy）は、渡された関数がそのまま Hono に登録する
import type { Context, Hono, Next } from "hono";
import { streamSSE } from "hono/streaming";
import { upgradeWebSocket } from "@hono/node-server";
import { z } from "zod";
import { splitKey, type Access, type Method, type RouteKind } from "@shared/foundation/contract";
import { callerOf } from "./caller";
import { fileResponse, type FileReply } from "./fileReply";
import type { ImplementedRoutes, MountEntry, Param, SseHandler, WsHandler } from "./implement";
import { jsonBody } from "./input";
import { resolveWorkdir } from "@/foundation/core/workplace/worktrees";

/** まだ取り決めに乗せていない受け口（Hono に直に登録する関数。access が public なら認証の外に登録する） */
export interface LegacyRoutes {
  readonly legacy: (app: Hono) => void;
  readonly access?: "public";
}

export type Mountable = LegacyRoutes | ImplementedRoutes;

/** 登録の段: public = 認証の外の口・auth = 認証のあとの口 */
type Phase = "public" | "auth";

const isLegacy = (r: Mountable): r is LegacyRoutes => "legacy" in r;
const inPhase = (access: string | undefined, phase: Phase) => (access === "public") === (phase === "public");

/**
 * その段の受け口を登録する。まだ取り決めに乗せていない受け口を先に、取り決めの分をあとに登録する
 * （同じメソッドとパスが両方にあれば起動で投げる）。取り決めの分は、同じメソッドの中で決まった文字の段を引数の段より先に登録する
 */
export function mount(app: Hono, routes: readonly Mountable[], phase: Phase): void {
  for (const r of routes) if (isLegacy(r) && inPhase(r.access, phase)) r.legacy(app);
  const entries = routes.flatMap((r) => (isLegacy(r) ? [] : r.entries.filter((e) => inPhase(e.spec.access, phase)).map((entry) => ({ entry, context: r.context }))));
  for (const { entry, context } of sortBySegments(entries)) register(app, entry, context);
}

/** 取り決めに乗せた口の一覧（端末の判定と、全ルートの記録が読む） */
export function routeTable(routes: readonly Mountable[]): { method: Method; path: string; kind: RouteKind; access: Access | null }[] {
  return routes.flatMap((r) => (isLegacy(r) ? [] : r.entries.map((e) => ({ ...splitKey(e.key), kind: e.spec.kind, access: e.spec.access ?? null }))));
}

/** 段の種類の順（決まった文字 → :引数 → *） */
const segmentRanks = (key: string) => splitKey(key).path.split("/").map((s) => (s === "*" ? 2 : s.startsWith(":") ? 1 : 0));

function sortBySegments<T extends { entry: MountEntry }>(entries: T[]): T[] {
  const ranks = new Map(entries.map((e) => [e, segmentRanks(e.entry.key)]));
  return entries.toSorted((a, b) => {
    const [ra, rb] = [ranks.get(a)!, ranks.get(b)!];
    for (let i = 0; i < Math.min(ra.length, rb.length); i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return 0;
  });
}

/** パスの引数の名前を消した形（:id と :snippetId を同じパスとして比べる） */
const shapeOf = (path: string) => path.replace(/:[^/]+/g, ":");

function register(app: Hono, entry: MountEntry, context: Readonly<Record<string, Param<unknown>>>): void {
  const { method, path } = splitKey(entry.key);
  if (app.routes.some((r) => r.method === method && shapeOf(r.path) === shapeOf(path))) throw new Error(`同じ受け口が 2 つあります: ${entry.key}`);
  const segments = path.split("/");
  const names = segments.flatMap((s) => (s === "*" ? ["*"] : s.startsWith(":") ? [s.slice(1)] : []));
  for (const name of names) if (!context[name]) throw new Error(`パスの引数の文脈がありません: ${name}（${entry.key}）`);
  if (entry.spec.workdir && !names.includes("projectId")) throw new Error(`workdir はパスに :projectId があるルートだけです: ${entry.key}`);

  app.on(method, path, async (c, next) => {
    let also = false;
    const ctx: Record<string, unknown> = { raw: c, useAlsoStatus: () => void (also = true) };
    const arounds: ((run: () => Promise<Response>) => Promise<Response>)[] = [];
    for (const name of names) {
      const param = context[name];
      // * は URL の生のパスの残り（符号化したまま。解くのは受け口。Hono が解いたあとの形だと %2F を取り違える）
      const raw = name === "*" ? new URL(c.req.url).pathname.split("/").slice(segments.indexOf("*")).join("/") : c.req.param(name)!;
      const value = await param.parse(raw);
      ctx[name] = value;
      const { around } = param;
      if (around) arounds.push((run) => around(value, run));
    }
    const workdir = entry.spec.workdir ? await resolveWorkdir((ctx.projectId as { repo_path: string }).repo_path, c.req.query("worktree") || undefined) : undefined;
    Object.defineProperties(ctx, {
      caller: { get: () => callerOf(c) },
      workdir: {
        get: () => {
          if (workdir === undefined) throw new Error(`取り決めに workdir: true がありません: ${entry.key}`);
          return workdir;
        },
      },
    });
    const handle = async (): Promise<Response> => {
      ctx.body = await bodyOf(c, entry);
      ctx.query = entry.query ? entry.query.parse(queryOf(c, entry.query)) : undefined;
      const reply = await entry.run(ctx);
      return respond(c, next, entry.spec, reply, also);
    };
    // 引数の包み（プロジェクトの GitHub のアカウントなど）を、パスの順に外から当てる
    return arounds.reduceRight<() => Promise<Response>>((inner, around) => () => around(inner), handle)();
  });
}

/** 本文: json は JSON（空なら {}・読めなければ 400）を zod で、form は multipart をそのまま（中の検査は受け口） */
async function bodyOf(c: Context, entry: MountEntry): Promise<unknown> {
  if (entry.spec.kind === "form") {
    const form = await c.req.parseBody({ all: true });
    return entry.body ? entry.body.parse(form) : form;
  }
  return entry.body ? entry.body.parse(await jsonBody(c)) : undefined;
}

/** クエリ: 空の値は指定なし。zod の形で並びの項目だけ全部の値、ほかは最初の値 */
function queryOf(c: Context, schema: z.ZodType): Record<string, string | string[]> {
  const shape = schema instanceof z.ZodObject ? (schema.shape as Record<string, z.ZodType>) : {};
  const out: Record<string, string | string[]> = {};
  for (const [name, values] of Object.entries(c.req.queries())) {
    const given = values.filter((v) => v !== "");
    if (given.length === 0) continue;
    out[name] = shape[name] && isArray(shape[name]) ? given : given[0];
  }
  return out;
}

const isArray = (t: z.ZodType): boolean =>
  t instanceof z.ZodOptional || t instanceof z.ZodNullable || t instanceof z.ZodDefault ? isArray(t.unwrap() as z.ZodType) : t instanceof z.ZodArray;

/** 受け口の戻り値を種類ごとの応答にする（失敗は投げるだけ。http/app.ts の onError がまとめる） */
async function respond(c: Context, next: Next, spec: MountEntry["spec"], reply: unknown, also: boolean): Promise<Response> {
  switch (spec.kind) {
    case "blob":
      return fileResponse(c, reply as FileReply);
    case "sse":
      return streamSSE(c, reply as SseHandler);
    case "ws":
      return (await upgradeWebSocket(() => reply as WsHandler)(c, next)) as Response;
    case "raw":
      return reply as Response;
    default: {
      const status = (reply === undefined || also) && spec.alsoStatus ? spec.alsoStatus : spec.status;
      return status === 204 ? c.body(null, 204) : c.json(reply ?? null, status);
    }
  }
}
