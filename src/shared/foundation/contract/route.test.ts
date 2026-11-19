import assert from "node:assert/strict";
import { test } from "vitest";
import type { Same } from "./phantom";
import { blob, empty, form, raw, route, splitKey, sse, ws, type BodyOf, type Contract, type ParamNames, type QueryOf, type ResOf, type RouteInput, type RouteOutput } from "./route";

// 型の確かめは型検査に任せる（形が違えば、この行が typecheck で落ちる）
const contract = {
  "GET /api/chats/:chatId/queue/:queueId": route<never, { id: string }, { full?: boolean }>(),
  "POST /api/snippets": route<{ text: string }, { id: number }>({ status: 201 }),
  "DELETE /api/snippets/:snippetId": empty(),
  "GET /api/files/*": blob(),
  "POST /api/uploads": form<{ id: string }>(),
  "GET /api/events": sse<{ type: string }>({ access: "device" }),
  "GET /api/terminals/:key/ws": ws<string, string>(),
  "GET /api/files/asset/*": raw(),
} as const satisfies Contract;
type C = typeof contract;

const _params: Same<ParamNames<"/api/chats/:chatId/queue/:queueId">, "chatId" | "queueId"> = true;
const _star: Same<ParamNames<"/api/files/*">, "*"> = true;
const _none: Same<ParamNames<"/api/snippets">, never> = true;
const _body: Same<BodyOf<C["POST /api/snippets"]>, { text: string }> = true;
const _res: Same<ResOf<C["POST /api/snippets"]>, { id: number }> = true;
const _query: Same<QueryOf<C["GET /api/chats/:chatId/queue/:queueId"]>, { full?: boolean }> = true;
const _noInput: Same<RouteInput<C, "GET /api/events">, undefined> = true;
const _bodyInput: Same<RouteInput<C, "POST /api/snippets">, { body: { text: string } }> = true;
const _empty: Same<RouteOutput<C, "DELETE /api/snippets/:snippetId">, void> = true;
const _blob: Same<RouteOutput<C, "GET /api/files/*", Uint8Array>, Uint8Array> = true;
void [_params, _star, _none, _body, _res, _query, _noInput, _bodyInput, _empty, _blob];

test("route と仲間: 種類・成功の状態コード・書いた選択肢だけを持つ", () => {
  assert.deepEqual(contract["POST /api/snippets"], { kind: "json", status: 201 });
  assert.deepEqual(contract["DELETE /api/snippets/:snippetId"], { kind: "json", status: 204 });
  assert.deepEqual(contract["GET /api/files/*"], { kind: "blob", status: 200 });
  assert.deepEqual(contract["POST /api/uploads"], { kind: "form", status: 200 });
  assert.deepEqual(contract["GET /api/events"], { kind: "sse", status: 200, access: "device" });
  assert.deepEqual(contract["GET /api/terminals/:key/ws"], { kind: "ws", status: 200 });
  assert.deepEqual(contract["GET /api/files/asset/*"], { kind: "raw", status: 200 });
  assert.deepEqual(route({ status: 202, alsoStatus: 204, workdir: true, marks: { locked: true } }), { kind: "json", status: 202, alsoStatus: 204, workdir: true, marks: { locked: true } });
});

test("splitKey: メソッドとパスに分ける", () => {
  assert.deepEqual(splitKey("DELETE /api/snippets/:snippetId"), { method: "DELETE", path: "/api/snippets/:snippetId" });
});
