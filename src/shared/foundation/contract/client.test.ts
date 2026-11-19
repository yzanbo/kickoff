import assert from "node:assert/strict";
import { test } from "vitest";
import { createClient, deviceRoutesOf, urlOf, type SendRequest } from "./client";
import { blob, empty, route, type Contract } from "./route";

const contract = {
  "GET /api/items": route<never, string[], { project_id?: number; open?: boolean; tag?: string[] }>({ access: "device" }),
  "POST /api/items": route<{ name: string }, { id: number }>({ status: 201 }),
  "PATCH /api/items/:itemId": route<{ name: string }, { id: number }>({ access: "deviceRead" }),
  "DELETE /api/items/:itemId": empty(),
  "GET /api/items/:itemId/file/*": blob(),
  "GET /api/status": route<never, { ok: true }>(),
} as const satisfies Contract;

/** 偽の送り手（送った頼みを覚え、決めた値を返す） */
function fakeSend() {
  const sent: { req: SendRequest; options: { keepalive?: boolean } | undefined }[] = [];
  const send = async (req: SendRequest, options: { keepalive?: boolean } | undefined) => {
    sent.push({ req, options });
    return "応答";
  };
  return { sent, call: createClient(contract, send) };
}

test("createClient: :name を埋め、本文・種類・選択肢を送り手に渡す", async () => {
  const { sent, call } = fakeSend();
  assert.equal(await call("PATCH /api/items/:itemId", { params: { itemId: 7 }, body: { name: "あ" } }, { keepalive: true }), "応答");
  assert.deepEqual(sent[0], { req: { method: "PATCH", path: "/api/items/7", kind: "json", body: { name: "あ" } }, options: { keepalive: true } });
});

test("createClient: 入力のないルート・中身がすべて省けるクエリは入力を省ける", async () => {
  const { sent, call } = fakeSend();
  await call("GET /api/status");
  await call("GET /api/items");
  await call("DELETE /api/items/:itemId", { params: { itemId: "a/b" } });
  assert.deepEqual(
    sent.map((s) => s.req),
    [
      { method: "GET", path: "/api/status", kind: "json" },
      { method: "GET", path: "/api/items", kind: "json" },
      { method: "DELETE", path: "/api/items/a%2Fb", kind: "json" },
    ],
  );
});

test("createClient: 種類は取り決めの kind", async () => {
  const { sent, call } = fakeSend();
  await call("GET /api/items/:itemId/file/*", { params: { itemId: 1, "*": "docs/a b.png" } });
  assert.deepEqual(sent[0].req, { method: "GET", path: "/api/items/1/file/docs/a%20b.png", kind: "blob" });
});

test("urlOf: クエリは値のない項目を付けず、真偽値は 1 / 0、並びは同じ名前を重ねる", () => {
  assert.equal(urlOf("GET /api/items", { query: { project_id: 3, open: false, tag: ["x", "y"], none: undefined, empty: "", nil: null } }), "/api/items?project_id=3&open=0&tag=x&tag=y");
  assert.equal(urlOf("GET /api/items", { query: {} }), "/api/items");
  assert.throws(() => urlOf("DELETE /api/items/:itemId"), /パスの引数がありません: :itemId/);
});

test("deviceRoutesOf: 端末に開いたルートだけ", () => {
  assert.deepEqual(Object.keys(deviceRoutesOf(contract)).sort(), ["GET /api/items", "PATCH /api/items/:itemId"]);
});
