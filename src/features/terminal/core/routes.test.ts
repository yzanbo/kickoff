// API のテスト: 内蔵ターミナルを API から使う口（一覧・始める・止める・WebSocket でつなぐ。スマホのターミナル）
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "vitest";
import WebSocket from "ws";
import type { TerminalCreated, TerminalServerMessage, TerminalTab } from "@shared/terminal/types";
import { startHttpServer, stopHttpServer } from "@/foundation/core/http/httpServer";
import { until } from "@/app/core/testing/testCore";
import { AUTH, setup } from "@/app/core/testing/testServer";

const FULL_TOKEN = "f".repeat(43);
const READ_TOKEN = "r".repeat(43);
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

function withDevices() {
  const ctx = setup({ features: ["terminal"] });
  ctx.store.settings.update({ mobile_enabled: true });
  const full = ctx.store.devices.create("Pixel", FULL_TOKEN, "full");
  const read = ctx.store.devices.create("タブレット", READ_TOKEN, "read");
  return { ...ctx, full, read };
}

const json = (headers: Record<string, string>) => ({ ...headers, "content-type": "application/json" });

/** この Mac の画面のタブのシェルを用意する（POST /api/terminals。持ち主は画面の印） */
const hostOpen = (app: ReturnType<typeof setup>["app"], body: { key: string; cwd: string; owner: string; meta?: { project_id: number; title: string } }) =>
  app.request("/api/terminals", { method: "POST", headers: json(AUTH), body: JSON.stringify({ cols: 80, rows: 24, start: null, meta: null, ...body }) });

/** 動いているシェルのタブ（GET /api/terminals） */
const tabsOf = async (app: ReturnType<typeof setup>["app"]) => (await (await app.request("/api/terminals", { headers: AUTH })).json()) as TerminalTab[];

test("ターミナル: 端末はプロジェクトの作業場所でシェルを始めて一覧に出せる。見るだけの端末は始められない。止められるのは自分が始めたものだけ", async () => {
  const { app, project, terminalFake } = withDevices();
  const body = JSON.stringify({ worktree_path: null, cols: 60, rows: 20 });
  const created = await app.request(`/api/projects/${project.id}/terminals`, { method: "POST", headers: json(bearer(FULL_TOKEN)), body });
  assert.equal(created.status, 201);
  const { key } = (await created.json()) as TerminalCreated;
  assert.equal(terminalFake.spawned[0].cwd, project.repo_path);
  const tabs = (await (await app.request(`/api/terminals?project_id=${project.id}`, { headers: bearer(READ_TOKEN) })).json()) as TerminalTab[];
  // 番号でない project_id は 400（絞らずに全部を返さない）
  assert.equal((await app.request("/api/terminals?project_id=abc", { headers: bearer(READ_TOKEN) })).status, 400);
  assert.deepEqual(
    tabs.map((t) => [t.key, t.title]),
    [[key, "ターミナル（Pixel）"]],
  );
  assert.equal((await app.request(`/api/projects/${project.id}/terminals`, { method: "POST", headers: json(bearer(READ_TOKEN)), body })).status, 403);
  // この Mac の画面のタブ（IPC で作ったもの）は、端末からは止められない
  assert.equal((await hostOpen(app, { key: "host-tab", cwd: project.repo_path, owner: "wc:1", meta: { project_id: project.id, title: "ターミナル" } })).status, 201);
  assert.equal((await app.request("/api/terminals/host-tab", { method: "DELETE", headers: bearer(FULL_TOKEN) })).status, 400);
  assert.equal((await app.request(`/api/terminals/${key}`, { method: "DELETE", headers: bearer(FULL_TOKEN) })).status, 204);
  assert.equal(terminalFake.spawned[0].killed, true);
  assert.equal((await app.request(`/api/terminals/${key}`, { method: "DELETE", headers: AUTH })).status, 404);
  // この Mac は何でも止められる
  assert.equal((await app.request("/api/terminals/host-tab", { method: "DELETE", headers: AUTH })).status, 204);
});

test("ターミナル: WebSocket でつなぐと画面の内容と出力が届き、打った文字はシェルへ。見るだけの端末の入力は捨て、持ち主でない人は大きさを変えられない", async (t) => {
  const { app, project, terminalFake } = withDevices();
  const server = await startHttpServer(app, { port: 0, host: "127.0.0.1" });
  t.onTestFinished(() => stopHttpServer(server));
  const port = (server.address() as AddressInfo).port;
  assert.equal((await hostOpen(app, { key: "tab", cwd: project.repo_path, owner: "wc:1" })).status, 201);
  const shell = terminalFake.spawned[0];
  shell.emit("before\r\n");

  const connect = (token: string) => {
    const messages: TerminalServerMessage[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/terminals/tab/ws?cols=40&rows=10`, { headers: bearer(token) });
    ws.on("message", (raw) => messages.push(JSON.parse(String(raw)) as TerminalServerMessage));
    const opened = new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    return { ws, messages, opened };
  };
  const full = connect(FULL_TOKEN);
  const read = connect(READ_TOKEN);
  await Promise.all([full.opened, read.opened]);
  await until(() => full.messages.length > 0 && read.messages.length > 0);
  assert.equal(full.messages[0].type, "snapshot");
  assert.match((full.messages[0] as { data: string }).data, /before/);

  full.ws.send(JSON.stringify({ type: "input", data: "ls\r" }));
  read.ws.send(JSON.stringify({ type: "input", data: "rm -rf /\r" }));
  full.ws.send(JSON.stringify({ type: "resize", cols: 30, rows: 8 }));
  await until(() => shell.written.length > 0);
  // test-rules-ignore: 捨てた入力には知らせも答えもないので、届くはずの間だけ待つ（来ないことを見る口がない）
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(shell.written, ["ls\r"]);
  assert.deepEqual([shell.cols, shell.rows], [80, 24]);

  shell.emit("after");
  await until(() => full.messages.some((m) => m.type === "data" && m.data.includes("after")) && read.messages.some((m) => m.type === "data"));
  // シェルが終わったら知らせて閉じる
  const closed = new Promise<void>((resolve) => full.ws.once("close", () => resolve()));
  shell.end(0);
  await closed;
  assert.deepEqual(full.messages.at(-1), { type: "exit", exit_code: 0 });
  read.ws.close();

  // ないシェル・トークンなしにはつなげない
  const missing = new WebSocket(`ws://127.0.0.1:${port}/api/terminals/none/ws`, { headers: bearer(FULL_TOKEN) });
  const status = await new Promise<number>((resolve) => missing.once("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0)));
  assert.equal(status, 404);
  const anonymous = new WebSocket(`ws://127.0.0.1:${port}/api/terminals/tab/ws`);
  assert.equal(await new Promise<number>((resolve) => anonymous.once("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0))), 401);
});

test("ターミナル: つないだあとで見るだけに変えた端末の入力は捨て、取り消した端末の WebSocket は切る", async (t) => {
  const { app, project, store, terminalFake, full, api } = withDevices();
  const server = await startHttpServer(app, { port: 0, host: "127.0.0.1" });
  t.onTestFinished(() => stopHttpServer(server));
  const port = (server.address() as AddressInfo).port;
  assert.equal((await hostOpen(app, { key: "tab", cwd: project.repo_path, owner: "wc:1" })).status, 201);
  const shell = terminalFake.spawned[0];
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/terminals/tab/ws`, { headers: bearer(FULL_TOKEN) });
  await new Promise((r) => ws.once("open", r));
  ws.send(JSON.stringify({ type: "input", data: "a" }));
  await until(() => shell.written.length === 1);
  // 見るだけに変えたら、開いたままでも打てない
  await api("PATCH /api/devices/:deviceId", { params: { deviceId: full.id }, body: { access: "read" } });
  ws.send(JSON.stringify({ type: "input", data: "b" }));
  // test-rules-ignore: 捨てた入力には知らせも答えもないので、届くはずの間だけ待つ（来ないことを見る口がない）
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(shell.written, ["a"]);
  // 取り消したら、つながったままの WebSocket も切る
  const closed = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  await api("DELETE /api/devices/:deviceId", { params: { deviceId: full.id } });
  await closed;
  assert.equal(store.devices.get(full.id), null);
});

test("ターミナル: この Mac の画面は POST /api/terminals でキー・フォルダ・コマンド・名前・持ち主を渡してシェルを用意し、同じキーでつなぎ直すと画面の内容が届く", async (t) => {
  const { app, project, terminals, terminalFake } = withDevices();
  const server = await startHttpServer(app, { port: 0, host: "127.0.0.1" });
  t.onTestFinished(() => stopHttpServer(server));
  const port = (server.address() as AddressInfo).port;
  const open = (body: Record<string, unknown>, headers: Record<string, string> = AUTH) =>
    app.request("/api/terminals", { method: "POST", headers: json(headers), body: JSON.stringify({ key: "side:1:t1", cwd: project.repo_path, cols: 80, rows: 24, owner: "wc:7", start: null, meta: null, ...body }) });

  const created = await open({ start: { command: "docker compose exec web sh", env: { A: "1" } }, meta: { project_id: project.id, title: "web" } });
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { created: true });
  const shell = terminalFake.spawned[0];
  assert.equal(shell.cwd, project.repo_path);
  assert.deepEqual(shell.args, ["-c", "docker compose exec web sh"]);
  assert.equal(shell.env.A, "1");
  assert.deepEqual(await tabsOf(app), [{ key: "side:1:t1", project_id: project.id, title: "web", cwd: project.repo_path, command: "docker compose exec web sh" }]);
  shell.emit("hello\r\n");

  // 同じキーはつなぎ直し（流し直さない。名前と持ち主だけ覚え直す）
  const again = await open({ owner: "wc:8", start: { command: "rm -rf /", env: null }, meta: { project_id: project.id, title: "web 2" } });
  assert.equal(again.status, 200);
  assert.deepEqual(await again.json(), { created: false });
  assert.equal(terminalFake.spawned.length, 1);
  // 持ち主は覚え直した（前の持ち主の画面が消えても止まらない）
  terminals.closeOwnedBy("wc:7");
  assert.equal(shell.killed, false);
  assert.equal((await tabsOf(app))[0].title, "web 2");

  // つなぐと、それまでの出力が画面の内容で届く。この Mac は持ち主の印が違っても大きさを変えられる
  const messages: TerminalServerMessage[] = [];
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/terminals/side:1:t1/ws?cols=80&rows=24`, { headers: AUTH });
  ws.on("message", (raw) => messages.push(JSON.parse(String(raw)) as TerminalServerMessage));
  await new Promise((r) => ws.once("open", r));
  await until(() => messages.length > 0);
  assert.equal(messages[0].type, "snapshot");
  assert.match((messages[0] as { data: string }).data, /hello/);
  ws.send(JSON.stringify({ type: "resize", cols: 100, rows: 30 }));
  await until(() => shell.cols === 100);
  ws.close();

  // 端末は使えない・持ち主に端末の印は名乗れない
  assert.equal((await open({ key: "x" }, bearer(FULL_TOKEN))).status, 403);
  assert.equal((await open({ key: "y", owner: "device:1" })).status, 400);
  assert.equal(terminalFake.spawned.length, 1);
  // いまの持ち主の画面が消えたら止まる
  terminals.closeOwnedBy("wc:8");
  assert.equal(shell.killed, true);
});

test("ターミナル: 画面が消えた・読み込み直したときの closeOwnedBy は、その持ち主のシェルだけを止める", async () => {
  const { app, project, terminals, terminalFake } = withDevices();
  for (const [key, owner] of [["a", "wc:1"], ["b", "wc:2"]]) {
    const res = await app.request("/api/terminals", { method: "POST", headers: json(AUTH), body: JSON.stringify({ key, cwd: project.repo_path, cols: 80, rows: 24, owner, start: null, meta: null }) });
    assert.equal(res.status, 201);
  }
  terminals.closeOwnedBy("wc:1");
  assert.deepEqual(
    terminalFake.spawned.map((s) => s.killed),
    [true, false],
  );
  assert.deepEqual(
    (await tabsOf(app)).map((tab) => tab.key),
    ["b"],
  );
});

test("ターミナル: PUT /api/terminals/:key/owner は持ち主だけを替え（つなぎ直さない・流し直さない）、ないシェルは始めずに 404。端末からは使えない", async () => {
  const { app, project, terminals, terminalFake } = withDevices();
  const res = await app.request("/api/terminals", { method: "POST", headers: json(AUTH), body: JSON.stringify({ key: "t", cwd: project.repo_path, cols: 80, rows: 24, owner: "wc:1", start: null, meta: null }) });
  assert.equal(res.status, 201);
  const put = (key: string, owner: string, headers: Record<string, string> = AUTH) =>
    app.request(`/api/terminals/${key}/owner`, { method: "PUT", headers: json(headers), body: JSON.stringify({ owner }) });
  assert.equal((await put("t", "wc:2")).status, 204);
  // 前の持ち主の画面が消えても止まらない
  terminals.closeOwnedBy("wc:1");
  assert.deepEqual((await tabsOf(app)).map((tab) => tab.key), ["t"]);
  assert.equal((await put("gone", "wc:2")).status, 404);
  assert.equal(terminalFake.spawned.length, 1);
  assert.equal((await put("t", "device:1")).status, 400);
  assert.equal((await put("t", "wc:3", bearer(FULL_TOKEN))).status, 403);
  // 持ち主は wc:2 のまま（その画面が消えたら止まる）
  terminals.closeOwnedBy("wc:3");
  assert.equal(terminalFake.spawned[0].killed, false);
  terminals.closeOwnedBy("wc:2");
  assert.equal(terminalFake.spawned[0].killed, true);
});
