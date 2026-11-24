import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { Hono } from "hono";
import { test } from "vitest";
import { z } from "zod";
import { blob, empty, route, type Contract } from "@shared/foundation/contract";
import { gitRepo } from "@/foundation/core/testing/gitRepo";
import { setCaller } from "./caller";
import { errorResponse } from "./errorResponse";
import { idParam, implement, textParam } from "./implement";
import { mount } from "./mount";

type Item = { id: number; name: string };
type Project = { id: number; repo_path: string };

/** 偽の取り決め（並びはわざと引数の段を先にする） */
const contract = {
  "GET /api/items/:itemId": route<never, Item>(),
  "GET /api/items/first": route<never, Item>(),
  "POST /api/items": route<{ name: string }, Item>({ status: 201 }),
  "POST /api/items/check": route<{ note?: string }, { note: string | null }>(),
  "GET /api/items": route<never, string[], { tag?: string[]; open?: "0" | "1" }>(),
  "DELETE /api/items/:itemId": empty(),
  "POST /api/items/:itemId/start": route<never, { started: true } | undefined>({ status: 202, alsoStatus: 204 }),
  "GET /api/items/:itemId/scope": route<never, { before: string | null; after: string | null }>(),
  "GET /api/items/:itemId/file": blob(),
  "GET /api/items/:itemId/codes/:code": route<never, { code: string }>(),
  "GET /api/projects/:projectId/where": route<never, { workdir: string }>({ workdir: true }),
  "GET /api/whoami": route<never, { kind: string }>(),
} as const satisfies Contract;

const scope = new AsyncLocalStorage<string>();

function appWith(projects: Project[] = []) {
  const items: Item[] = [{ id: 1, name: "あ" }];
  const routes = implement(contract, {
    context: {
      itemId: { ...idParam((id) => items.find((i) => i.id === id), "項目が見つかりません"), around: (item, run) => scope.run(`項目 ${item.id}`, run) },
      code: textParam(z.string().regex(/^[a-z]+$/)),
      projectId: idParam((id) => projects.find((p) => p.id === id), "プロジェクトが見つかりません"),
    },
    "GET /api/items/:itemId": { run: ({ itemId }) => itemId },
    "GET /api/items/first": { run: () => ({ id: 0, name: "決まった段" }) },
    "POST /api/items": { body: z.object({ name: z.string().min(1) }), run: ({ body }) => ({ id: 2, name: body.name }) },
    "POST /api/items/check": { body: z.object({ note: z.string().optional() }), run: ({ body }) => ({ note: body.note ?? null }) },
    "GET /api/items": { query: z.object({ tag: z.array(z.string()).optional(), open: z.enum(["0", "1"]).optional() }), run: ({ query }) => [...(query.tag ?? []), query.open ?? "-"] },
    "DELETE /api/items/:itemId": { run: () => undefined },
    "POST /api/items/:itemId/start": { run: ({ itemId }) => (itemId.id === 1 ? { started: true as const } : undefined) },
    "GET /api/items/:itemId/scope": {
      run: async () => {
        const before = scope.getStore() ?? null;
        await new Promise((resolve) => setImmediate(resolve));
        return { before, after: scope.getStore() ?? null };
      },
    },
    "GET /api/items/:itemId/file": { run: () => ({ bytes: new Uint8Array([1, 2, 3]), type: "image/png", cache: "private, max-age=3600" }) },
    "GET /api/items/:itemId/codes/:code": { run: ({ code }) => ({ code }) },
    "GET /api/projects/:projectId/where": { run: ({ workdir }) => ({ workdir }) },
    "GET /api/whoami": { run: ({ caller }) => ({ kind: caller.kind }) },
  });
  const app = new Hono();
  app.use("*", (c, next) => {
    setCaller(c, { kind: "device", deviceId: 3, readOnly: false });
    return next();
  });
  app.onError((err, c) => {
    const { status, body } = errorResponse(err);
    return c.json(body, status);
  });
  mount(app, [routes], "auth");
  return { app, items };
}

const json = (body: string) => ({ method: "POST", headers: { "content-type": "application/json" }, body });

test("mount: 本文は空なら {}、JSON として読めなければ 400、zod に合わなければ 400", async () => {
  const { app } = appWith();
  const empty = await app.request("/api/items/check", { method: "POST" });
  assert.deepEqual([empty.status, await empty.json()], [200, { note: null }]);
  const broken = await app.request("/api/items", json("{"));
  assert.deepEqual([broken.status, (await broken.json()).error], [400, "本文が JSON として読めません"]);
  const invalid = await app.request("/api/items", json(JSON.stringify({ name: "" })));
  assert.equal(invalid.status, 400);
});

test("mount: 番号でない :itemId は 400、なければ 404、形の違う文字の引数は 400", async () => {
  const { app } = appWith();
  const notNumber = await app.request("/api/items/1.5");
  assert.deepEqual([notNumber.status, (await notNumber.json()).error], [400, "ID の指定が正しくありません"]);
  const missing = await app.request("/api/items/9");
  assert.deepEqual([missing.status, (await missing.json()).error], [404, "項目が見つかりません"]);
  assert.deepEqual(await (await app.request("/api/items/1/codes/abc")).json(), { code: "abc" });
  assert.equal((await app.request("/api/items/1/codes/ABC")).status, 400);
});

test("mount: 決まった文字の段を引数の段より先に登録する（取り決めの並びによらない）", async () => {
  const { app } = appWith();
  assert.deepEqual(await (await app.request("/api/items/first")).json(), { id: 0, name: "決まった段" });
  assert.deepEqual(await (await app.request("/api/items/1")).json(), { id: 1, name: "あ" });
});

test("mount: クエリは zod の並びの項目だけ全部の値、ほかは最初の値。空の値は指定なし", async () => {
  const { app } = appWith();
  assert.deepEqual(await (await app.request("/api/items?tag=a&tag=b&open=1&open=0")).json(), ["a", "b", "1"]);
  assert.deepEqual(await (await app.request("/api/items?open=")).json(), ["-"]);
});

test("mount: workdir は ?worktree= がなければ本体、このプロジェクトのワークツリーでなければ 400", async () => {
  const { dir } = gitRepo({ files: { "a.txt": "a" } });
  const { app } = appWith([{ id: 1, repo_path: dir }]);
  assert.deepEqual(await (await app.request("/api/projects/1/where")).json(), { workdir: dir });
  const other = await app.request(`/api/projects/1/where?worktree=${encodeURIComponent(`${dir}-other`)}`);
  assert.deepEqual([other.status, (await other.json()).error], [400, "このプロジェクトのワークツリーではありません"]);
});

test("mount: 引数の around は受け口の待ちのあとも包む", async () => {
  const { app } = appWith();
  assert.deepEqual(await (await app.request("/api/items/1/scope")).json(), { before: "項目 1", after: "項目 1" });
});

test("mount: 成功の状態コード（201・204・202 と、undefined を返したときの 204）", async () => {
  const { app, items } = appWith();
  assert.equal((await app.request("/api/items", json(JSON.stringify({ name: "い" })))).status, 201);
  const deleted = await app.request("/api/items/1", { method: "DELETE" });
  assert.deepEqual([deleted.status, await deleted.text()], [204, ""]);
  assert.deepEqual([(await app.request("/api/items/1/start", { method: "POST" })).status], [202]);
  items.push({ id: 5, name: "う" });
  const none = await app.request("/api/items/5/start", { method: "POST" });
  assert.deepEqual([none.status, await none.text()], [204, ""]);
});

test("mount: blob は中身と、sandbox の CSP・nosniff・キャッシュの見出しを返す", async () => {
  const { app } = appWith();
  const res = await app.request("/api/items/1/file");
  assert.equal(res.status, 200);
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), new Uint8Array([1, 2, 3]));
  assert.deepEqual(
    ["content-type", "content-security-policy", "x-content-type-options", "cache-control"].map((h) => res.headers.get(h)),
    ["image/png", "sandbox", "nosniff", "private, max-age=3600"],
  );
});

test("mount: 呼び主は認証が覚えたもの", async () => {
  const { app } = appWith();
  assert.deepEqual(await (await app.request("/api/whoami")).json(), { kind: "device" });
});

test("mount: まだ取り決めに乗せていない受け口を先に登録し、同じメソッドとパスが両方にあれば投げる", () => {
  const app = new Hono();
  const routes = implement({ "GET /api/a/:aId": route<never, string>() } as const satisfies Contract, { context: { aId: idParam(() => "a", "なし") }, "GET /api/a/:aId": { run: () => "a" } });
  assert.throws(() => mount(app, [routes, { legacy: (a) => void a.get("/api/a/:id", (c) => c.text("前")) }], "auth"), /同じ受け口が 2 つあります: GET \/api\/a\/:aId/);
});
