import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { blob, empty, route, sse, type Contract } from "@shared/foundation/contract";
import { form } from "@shared/foundation/contract/route";
import { ApiError } from "./http";
import { client } from "./client";

const contract = {
  "GET /api/items": route<never, string[], { project_id?: number | null; open?: boolean; q?: string }>(),
  "POST /api/items": route<{ name: string }, { id: number }>({ status: 201 }),
  "DELETE /api/items/:itemId": empty(),
  "GET /api/items/:itemId/image": blob(),
  "POST /api/items/upload": form<{ ok: true }>(),
  "GET /api/items/events": sse<{ type: string }>(),
} as const satisfies Contract;

/** 偽の fetch（受けた頼みを覚え、決めた応答を順に返す。応答が関数なら呼ぶ） */
function fakeFetch(...replies: (Response | (() => never))[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const reply = replies.shift();
    if (!reply) throw new Error("応答を決めていません");
    return typeof reply === "function" ? reply() : reply;
  });
  vi.stubGlobal("fetch", fetch);
  return calls;
}

/** 呼び出しの失敗を受け取る */
async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  assert.fail("失敗しませんでした");
}

const items = client(contract);

test("client: 道の :name を符号化して埋め、GET と DELETE は本文なしで送る", async () => {
  const calls = fakeFetch(Response.json(["a"]), new Response(null, { status: 204 }));
  assert.deepEqual(await items("GET /api/items"), ["a"]);
  assert.equal(await items("DELETE /api/items/:itemId", { params: { itemId: "a/b" } }), undefined);
  assert.deepEqual(
    calls.map(({ url, init }) => [url, init.method, init.body, init.headers, init.credentials]),
    [
      ["/api/items", "GET", undefined, undefined, "same-origin"],
      ["/api/items/a%2Fb", "DELETE", undefined, undefined, "same-origin"],
    ],
  );
});

test("client: クエリは値のない項目（undefined・null・空の文字）を付けず、真偽値は 1 / 0", async () => {
  const calls = fakeFetch(Response.json([]), Response.json([]));
  await items("GET /api/items", { query: { project_id: null, open: true, q: "" } });
  await items("GET /api/items", { query: { project_id: 3, open: false, q: "a b" } });
  assert.deepEqual(
    calls.map((c) => c.url),
    ["/api/items?open=1", "/api/items?project_id=3&open=0&q=a+b"],
  );
});

test("client: json は本文を JSON で送り、keepalive・signal を fetch に渡す", async () => {
  const calls = fakeFetch(Response.json({ id: 1 }, { status: 201 }), Response.json({ id: 2 }, { status: 201 }));
  const signal = new AbortController().signal;
  assert.deepEqual(await items("POST /api/items", { body: { name: "あ" } }, { keepalive: true, signal }), { id: 1 });
  await items("POST /api/items", { body: { name: "い" } });
  assert.equal(calls[0].init.body, JSON.stringify({ name: "あ" }));
  assert.deepEqual(calls[0].init.headers, { "content-type": "application/json" });
  assert.equal(calls[0].init.keepalive, true);
  assert.equal(calls[0].init.signal, signal);
  assert.equal(calls[1].init.keepalive, false);
});

test("client: 失敗の本文の { error, code } は ApiError に、つながらなければ core_down（status 0）", async () => {
  vi.stubGlobal("window", {});
  fakeFetch(Response.json({ error: "見つかりません", code: "missing" }, { status: 404 }), () => {
    throw new TypeError("Failed to fetch");
  });
  const missing = await failureOf(items("GET /api/items"));
  assert.ok(missing instanceof ApiError);
  assert.deepEqual([missing.status, missing.message, missing.code], [404, "見つかりません", "missing"]);
  const down = await failureOf(items("GET /api/items"));
  assert.ok(down instanceof ApiError);
  assert.deepEqual([down.status, down.code], [0, "core_down"]);
});

test("client: 止めた頼み（AbortError）は ApiError にせずそのまま投げる", async () => {
  const aborted = new DOMException("中止", "AbortError");
  fakeFetch(() => {
    throw aborted;
  });
  assert.equal(await failureOf(items("GET /api/items")), aborted);
});

test("client: form は本文を FormData にして送る（Blob はそのまま、ほかは文字。undefined・null は送らない）", async () => {
  const calls = fakeFetch(Response.json({ ok: true }));
  const file = new Blob(["音"], { type: "audio/webm" });
  await items("POST /api/items/upload", { body: { file, language: "ja", count: 2, none: undefined, nil: null } });
  const body = calls[0].init.body;
  assert.ok(body instanceof FormData);
  assert.deepEqual([...body.keys()], ["file", "language", "count"]);
  assert.equal(await (body.get("file") as Blob).text(), "音");
  assert.equal(body.get("count"), "2");
  assert.equal(calls[0].init.headers, undefined);
});

test("client: blob は本文とヘッダーを返し、sse は呼べずに url を使う", async () => {
  fakeFetch(new Response("png", { headers: { "x-mtime": "5" } }));
  const { blob: image, headers } = await items("GET /api/items/:itemId/image", { params: { itemId: 3 } });
  assert.equal(await image.text(), "png");
  assert.equal(headers.get("x-mtime"), "5");
  await assert.rejects(items("GET /api/items/events"), /sse のルートは呼べません/);
  assert.equal(items.url("GET /api/items/:itemId/image", { params: { itemId: 3 } }), "/api/items/3/image");
});

test("client: onError の口は、その code の失敗で呼ばれ、retry で同じ頼みをもう一度送る", async () => {
  const locked = () => Response.json({ error: "鍵がかかっています", code: "locked" }, { status: 409 });
  const seen: string[] = [];
  const unlocking = client(contract, {
    onError: {
      locked: async (error, retry) => {
        seen.push(error.message);
        return retry();
      },
    },
  });
  const calls = fakeFetch(locked(), Response.json({ id: 9 }, { status: 201 }), Response.json({ error: "壊れました" }, { status: 500 }));
  assert.deepEqual(await unlocking("POST /api/items", { body: { name: "あ" } }), { id: 9 });
  assert.deepEqual(seen, ["鍵がかかっています"]);
  assert.equal(calls[1].init.body, calls[0].init.body);
  // 口のない code（なし）はそのまま失敗
  const failed = await failureOf(unlocking("GET /api/items"));
  assert.ok(failed instanceof ApiError && failed.message === "壊れました");
});

test("client: fetch を差し替えた呼び手は、その口だけで送る", async () => {
  const own = vi.fn(async () => Response.json(["own"]));
  const global = fakeFetch();
  assert.deepEqual(await client(contract, { fetch: own })("GET /api/items"), ["own"]);
  assert.equal(own.mock.calls.length, 1);
  assert.equal(global.length, 0);
});

test("client: 入力と応答の型は取り決めから（型検査が確かめる）", () => {
  const typed = (): void => {
    // @ts-expect-error 本文のあるルートは入力を省けない
    void items("POST /api/items");
    // @ts-expect-error パスの引数の名前は取り決めのとおり
    void items("DELETE /api/items/:itemId", { params: { id: 1 } });
    // @ts-expect-error 取り決めにないルート
    void items("GET /api/other");
    const created: Promise<{ id: number }> = items("POST /api/items", { body: { name: "あ" } });
    void created;
  };
  assert.equal(typeof typed, "function");
});
