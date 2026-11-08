import assert from "node:assert/strict";
import { test } from "node:test";
import { ipcEntries, type IpcKind } from "@shared/ipc";
import { createNativeApi, type RendererIpc } from "../../preload/nativeApi.js";
import { IPC_ARGS } from "./args.js";
import { fromApp, IpcRejected, registerIpcHandlers, sendEvent, type IpcHandlers, type MainIpc } from "./register.js";

const APP_URL = "http://127.0.0.1:4318";
const fromScreen = { senderFrame: { url: `${APP_URL}/#/projects/1` } };

type Listener = (event: unknown, ...args: unknown[]) => unknown;

/** メインの登録（偽の ipcMain）。処理はすべて、呼ばれた名前と引数を覚えるだけの偽物にする */
function registerMain() {
  const handled = new Map<string, Listener>();
  const listened = new Map<string, Listener>();
  const ipc: MainIpc = {
    handle: (channel, listener) => {
      assert.ok(!handled.has(channel), `${channel} を 2 回登録しました`);
      handled.set(channel, listener as Listener);
    },
    on: (channel, listener) => {
      assert.ok(!listened.has(channel), `${channel} を 2 回登録しました`);
      listened.set(channel, listener as Listener);
    },
  };
  const calls: { name: string; args: unknown[] }[] = [];
  const warnings: string[] = [];
  const groups = [...new Set(ipcEntries().map((e) => e.group))];
  const handlers = Object.fromEntries(
    groups.map((group) => [
      group,
      new Proxy({}, { get: (_t, method) => (_event: unknown, ...args: unknown[]) => (calls.push({ name: `${group}.${String(method)}`, args }), "ok") }),
    ]),
  ) as unknown as IpcHandlers;
  registerIpcHandlers(ipc, { schemas: IPC_ARGS, handlers, trusted: fromApp(APP_URL), warn: (m) => warnings.push(m) });
  return { handled, listened, calls, warnings };
}

/** preload が作る window.kickoff（偽の ipcRenderer）。使ったチャンネルを種類ごとに覚える */
function preloadChannels() {
  const used: Record<IpcKind | "off", string[]> = { invoke: [], send: [], event: [], off: [] };
  const ipc: RendererIpc = {
    invoke: async (channel) => void used.invoke.push(channel),
    send: (channel) => void used.send.push(channel),
    on: (channel) => used.event.push(channel),
    off: (channel) => used.off.push(channel),
  };
  const api = createNativeApi(ipc) as unknown as Record<string, Record<string, (...args: unknown[]) => unknown>>;
  for (const { group, method, kind } of ipcEntries()) {
    const fn = api[group][method];
    if (kind === "event") (fn(() => {}) as () => void)();
    else void fn();
  }
  return used;
}

const sorted = (list: Iterable<string>) => [...list].sort();

test("IPC: メインが登録するチャンネルと、preload が使うチャンネルが一致する（invoke・send・知らせ）", () => {
  const main = registerMain();
  const preload = preloadChannels();
  assert.deepEqual(sorted(main.handled.keys()), sorted(preload.invoke));
  assert.deepEqual(sorted(main.listened.keys()), sorted(preload.send));
  // 知らせ: メインが送るチャンネル（sendEvent）を、preload が受け取っている。受け取りをやめるときも同じチャンネル
  const emitted: string[] = [];
  const screen = { isDestroyed: () => false, send: (channel: string) => void emitted.push(channel) };
  for (const { group, method, kind } of ipcEntries()) if (kind === "event") sendEvent(screen, group as never, method as never, ...([] as never));
  assert.deepEqual(sorted(emitted), sorted(preload.event));
  assert.deepEqual(sorted(preload.off), sorted(preload.event));
  // 表のすべての項目が、どれか 1 つに入っている
  assert.equal(preload.invoke.length + preload.send.length + preload.event.length, ipcEntries().length);
});

test("IPC のチャンネル名: 「種類:まとまり.名前」で重ならない。知らせの名前は on… で、ほかは on で始めない", () => {
  const entries = ipcEntries();
  assert.equal(new Set(entries.map((e) => e.channel)).size, entries.length);
  for (const { group, method, kind, channel } of entries) {
    assert.equal(channel, `${kind}:${group}.${method}`);
    assert.match(channel, /^(invoke|send|event):[a-z][A-Za-z]*\.[a-z][A-Za-z]*$/);
    assert.equal(/^on[A-Z]/.test(method), kind === "event", `${channel} の名前`);
  }
});

test("IPC の引数: 取り決めの形のものだけを処理に渡す（invoke は失敗を返し、send は捨てる。どちらも書き残す）", async () => {
  const { handled, listened, calls, warnings } = registerMain();
  const notify = handled.get("invoke:notifications.notify")!;
  // 通したあとの形（前後の空白を除いたタイトル）を処理に渡す
  assert.equal(await notify(fromScreen, { title: " 完了 ", body: "x", chat: { projectId: 1, chatId: 2 } }), "ok");
  assert.deepEqual(calls.pop(), { name: "notifications.notify", args: [{ title: "完了", body: "x", chat: { projectId: 1, chatId: 2 } }] });
  await assert.rejects(async () => notify(fromScreen, { title: " ", body: "" }), (e: Error) => e instanceof IpcRejected && /notifications\.notify.*通知のタイトルがありません/.test(e.message));
  await assert.rejects(async () => notify(fromScreen, { title: "完了", body: "", chat: { projectId: 1, chatId: -1 } }), IpcRejected);
  // 数・種類の違う引数、知らない値、相対パス
  await assert.rejects(async () => handled.get("invoke:dialog.pickReferences")!(fromScreen, "x"), IpcRejected);
  await assert.rejects(async () => handled.get("invoke:externalApps.openTerminal")!(fromScreen, "/w", "nope"), IpcRejected);
  await assert.rejects(async () => handled.get("invoke:externalApps.openPath")!(fromScreen, "relative/dir"), IpcRejected);
  await assert.rejects(async () => handled.get("invoke:browserExtensions.install")!(fromScreen, "toString"), IpcRejected);
  await assert.rejects(async () => handled.get("invoke:dialog.pickFolder")!(fromScreen, "t", { buttonLabel: 1 }), IpcRejected);
  // 省ける引数は省いてよい
  assert.equal(await handled.get("invoke:externalApps.openTerminal")!(fromScreen, "/w"), "ok");
  assert.deepEqual(calls.pop(), { name: "externalApps.openTerminal", args: ["/w"] });
  // フォルダを選ぶ窓の文（何のために選ぶか）は渡しても省いてもよい
  assert.equal(await handled.get("invoke:dialog.pickFolder")!(fromScreen, "t", { message: "m", buttonLabel: "b" }), "ok");
  assert.deepEqual(calls.pop(), { name: "dialog.pickFolder", args: ["t", { message: "m", buttonLabel: "b" }] });
  assert.equal(await handled.get("invoke:dialog.pickFolder")!(fromScreen), "ok");
  assert.deepEqual(calls.pop(), { name: "dialog.pickFolder", args: [] });
  assert.equal(calls.length, 0);
  assert.equal(warnings.length, 7);

  const write = listened.get("send:terminal.write")!;
  write(fromScreen, "", "ls\r");
  write(fromScreen, "t1", 42);
  assert.equal(calls.length, 0);
  assert.equal(warnings.length, 9);
  write(fromScreen, "t1", "ls\r");
  assert.deepEqual(calls.pop(), { name: "terminal.write", args: ["t1", "ls\r"] });
});

test("IPC の送り手: Kickoff の画面（同じ出どころ）からのものだけ受け付ける", async () => {
  const { handled, listened, calls, warnings } = registerMain();
  const openPath = handled.get("invoke:externalApps.openPath")!;
  await assert.rejects(async () => openPath({ senderFrame: { url: "https://example.com/" } }, "/w"), /Kickoff の画面以外/);
  await assert.rejects(async () => openPath({ senderFrame: null }, "/w"), /Kickoff の画面以外/);
  listened.get("send:terminal.write")!({ senderFrame: { url: "http://127.0.0.1:4319/" } }, "t1", "rm -rf ~\r");
  assert.equal(calls.length, 0);
  assert.equal(warnings.length, 3);
  assert.equal(await openPath(fromScreen, "/w"), "ok");
});

test("画面への知らせ: 画面がない・閉じていれば送らない", () => {
  const sent: unknown[][] = [];
  const screen = (destroyed: boolean) => ({ isDestroyed: () => destroyed, send: (...args: unknown[]) => void sent.push(args) });
  sendEvent(screen(false), "terminal", "onData", "t1", "hello");
  sendEvent(screen(true), "terminal", "onData", "t1", "lost");
  sendEvent(undefined, "terminal", "onExit", "t1", 0);
  assert.deepEqual(sent, [["event:terminal.onData", "t1", "hello"]]);
});
