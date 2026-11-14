// API のテスト: 内蔵ターミナルを API から使う口（一覧・始める・止める・WebSocket でつなぐ。スマホのターミナル）
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import WebSocket from "ws";
import type { TerminalCreated, TerminalServerMessage, TerminalTab } from "@shared/types";
import { hashToken } from "./caller.js";
import { startHttpServer, stopHttpServer } from "./httpServer.js";
import { until } from "../testing/testCore.js";
import { AUTH, setup } from "../testing/testServer.js";

const FULL_TOKEN = "f".repeat(43);
const READ_TOKEN = "r".repeat(43);
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

function withDevices() {
  const ctx = setup();
  ctx.store.settings.update({ remote_enabled: true });
  const full = ctx.store.devices.create("Pixel", hashToken(FULL_TOKEN), "full");
  const read = ctx.store.devices.create("タブレット", hashToken(READ_TOKEN), "read");
  return { ...ctx, full, read };
}

const json = (headers: Record<string, string>) => ({ ...headers, "content-type": "application/json" });

test("ターミナル: 端末はプロジェクトの作業場所でシェルを始めて一覧に出せる。見るだけの端末は始められない。止められるのは自分が始めたものだけ", async () => {
  const { app, project, terminals, terminalFake } = withDevices();
  const body = JSON.stringify({ worktree_path: null, cols: 60, rows: 20 });
  const created = await app.request(`/api/projects/${project.id}/terminals`, { method: "POST", headers: json(bearer(FULL_TOKEN)), body });
  assert.equal(created.status, 201);
  const { key } = (await created.json()) as TerminalCreated;
  assert.equal(terminalFake.spawned[0].cwd, project.repo_path);
  const tabs = (await (await app.request(`/api/terminals?project_id=${project.id}`, { headers: bearer(READ_TOKEN) })).json()) as TerminalTab[];
  assert.deepEqual(
    tabs.map((t) => [t.key, t.title]),
    [[key, "ターミナル（Pixel）"]],
  );
  assert.equal((await app.request(`/api/projects/${project.id}/terminals`, { method: "POST", headers: json(bearer(READ_TOKEN)), body })).status, 403);
  // この Mac の画面のタブ（IPC で作ったもの）は、端末からは止められない
  await terminals.open({ key: "host-tab", cwd: project.repo_path, cols: 80, rows: 24, client: { id: "wc:1", data: () => {}, exit: () => {} }, owner: "wc:1", meta: { projectId: project.id, title: "ターミナル" } });
  assert.equal((await app.request("/api/terminals/host-tab", { method: "DELETE", headers: bearer(FULL_TOKEN) })).status, 400);
  assert.equal((await app.request(`/api/terminals/${key}`, { method: "DELETE", headers: bearer(FULL_TOKEN) })).status, 204);
  assert.equal(terminalFake.spawned[0].killed, true);
  assert.equal((await app.request(`/api/terminals/${key}`, { method: "DELETE", headers: AUTH })).status, 404);
  // この Mac は何でも止められる
  assert.equal((await app.request("/api/terminals/host-tab", { method: "DELETE", headers: AUTH })).status, 204);
});

test("ターミナル: WebSocket でつなぐと画面の内容と出力が届き、打った文字はシェルへ。見るだけの端末の入力は捨て、持ち主でない人は大きさを変えられない", async (t) => {
  const { app, project, terminals, terminalFake } = withDevices();
  const server = await startHttpServer(app, { port: 0, host: "127.0.0.1" });
  t.after(() => stopHttpServer(server));
  const port = (server.address() as AddressInfo).port;
  await terminals.open({ key: "tab", cwd: project.repo_path, cols: 80, rows: 24, client: { id: "wc:1", data: () => {}, exit: () => {} }, owner: "wc:1" });
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
