import assert from "node:assert/strict";
import { test } from "vitest";
import { ipcEntries, type IpcKind } from "@shared/foundation/ipc";
import { browserArgs } from "@/features/browser/desktop/ipcArgs";
import { diagnosticsArgs } from "@/features/diagnostics/desktop/ipcArgs";
import { updatesArgs } from "@/features/updates/desktop/ipcArgs";
import { foundationArgs } from "@/foundation/desktop/ipc/args";
import { fromApp, IpcRejected, registerIpcHandlers, sendEvent, type IpcArgSchemas, type IpcHandlers, type MainIpc } from "@/foundation/desktop/ipc/register";
import { createNativeApi, type RendererIpc } from "@/foundation/desktop/preload/nativeApi";
import { NATIVE_API } from "@/app/shared/ipc";

// 全部のまとまりを並べた IPC の表（NATIVE_API）と、土台・機能の引数の形を合わせたものを、登録の土台（register.ts）と preload の作り方で確かめる
const ALL_ARGS = { ...foundationArgs, ...browserArgs, ...diagnosticsArgs, ...updatesArgs } satisfies IpcArgSchemas;

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
  const groups = [...new Set(ipcEntries(NATIVE_API).map((e) => e.group))];
  const handlers = Object.fromEntries(
    groups.map((group) => [
      group,
      new Proxy({}, { get: (_t, method) => (_event: unknown, ...args: unknown[]) => (calls.push({ name: `${group}.${String(method)}`, args }), "ok") }),
    ]),
  ) as unknown as IpcHandlers;
  registerIpcHandlers(ipc, { table: NATIVE_API, schemas: ALL_ARGS, handlers, trusted: fromApp(APP_URL), warn: (m) => warnings.push(m) });
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
  const api = createNativeApi(ipc, NATIVE_API) as unknown as Record<string, Record<string, (...args: unknown[]) => unknown>>;
  for (const { group, method, kind } of ipcEntries(NATIVE_API)) {
    const fn = api[group][method];
    if (kind === "event") (fn(() => {}) as () => void)();
    else void fn();
  }
  return used;
}

const sorted = (list: Iterable<string>) => [...list].sort();

test("状態バッジの IPC は非負の整数と色または null を受け付ける", () => {
  const { listened, calls, warnings } = registerMain();
  const send = listened.get("send:notifications.setStateBadges")!;
  const badges = { counts: { running: 2, needsInput: 0, unread: 1_000_001 }, colors: { running: "#65acee", needsInput: null, unread: "不正な色" } };
  for (const running of [-1, 0.5, NaN, Infinity, "2"]) send(fromScreen, { ...badges, counts: { ...badges.counts, running } });
  send(fromScreen, { ...badges, colors: { ...badges.colors, running: 2 } });
  assert.deepEqual(calls, []);
  assert.equal(warnings.length, 6);
  send(fromScreen, { ...badges, chatName: "ファイルに渡さない" });
  assert.deepEqual(calls, [{ name: "notifications.setStateBadges", args: [badges] }]);
});

test("IPC: メインが登録するチャンネルと、preload が使うチャンネルが一致する（invoke・send・知らせ）", () => {
  const main = registerMain();
  const preload = preloadChannels();
  assert.deepEqual(sorted(main.handled.keys()), sorted(preload.invoke));
  assert.deepEqual(sorted(main.listened.keys()), sorted(preload.send));
  // 知らせ: メインが送るチャンネル（sendEvent）を、preload が受け取っている。受け取りをやめるときも同じチャンネル
  const emitted: string[] = [];
  const screen = { isDestroyed: () => false, send: (channel: string) => void emitted.push(channel) };
  for (const { group, method, kind } of ipcEntries(NATIVE_API)) if (kind === "event") sendEvent(screen, group as never, method as never, ...([] as never));
  assert.deepEqual(sorted(emitted), sorted(preload.event));
  assert.deepEqual(sorted(preload.off), sorted(preload.event));
  // 表のすべての項目が、どれか 1 つに入っている
  assert.equal(preload.invoke.length + preload.send.length + preload.event.length, ipcEntries(NATIVE_API).length);
});

test("IPC のチャンネル名: 「種類:まとまり.名前」で重ならない。知らせの名前は on… で、ほかは on で始めない", () => {
  const entries = ipcEntries(NATIVE_API);
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

  const setDockIcon = listened.get("send:notifications.setDockIcon")!;
  setDockIcon(fromScreen, "data:image/jpeg;base64,AAAA");
  setDockIcon(fromScreen, 3);
  assert.equal(calls.length, 0);
  assert.equal(warnings.length, 9);
  setDockIcon(fromScreen, "data:image/png;base64,AAAA");
  assert.deepEqual(calls.pop(), { name: "notifications.setDockIcon", args: ["data:image/png;base64,AAAA"] });
  setDockIcon(fromScreen, null);
  assert.deepEqual(calls.pop(), { name: "notifications.setDockIcon", args: [null] });
});

test("IPC の送り手: Kickoff の画面（同じ出どころ）からのものだけ受け付ける", async () => {
  const { handled, listened, calls, warnings } = registerMain();
  const openPath = handled.get("invoke:externalApps.openPath")!;
  await assert.rejects(async () => openPath({ senderFrame: { url: "https://example.com/" } }, "/w"), /Kickoff の画面以外/);
  await assert.rejects(async () => openPath({ senderFrame: null }, "/w"), /Kickoff の画面以外/);
  listened.get("send:notifications.setDockIcon")!({ senderFrame: { url: "http://127.0.0.1:4319/" } }, null);
  assert.equal(calls.length, 0);
  assert.equal(warnings.length, 3);
  assert.equal(await openPath(fromScreen, "/w"), "ok");
});

test("画面への知らせ: 画面がない・閉じていれば送らない", () => {
  const sent: unknown[][] = [];
  const screen = (destroyed: boolean) => ({ isDestroyed: () => destroyed, send: (...args: unknown[]) => void sent.push(args) });
  sendEvent(screen(false), "notifications", "onOpenChat", 1, 2);
  sendEvent(screen(true), "notifications", "onOpenChat", 1, 3);
  sendEvent(undefined, "notifications", "onOpenCi", 1, 4);
  assert.deepEqual(sent, [["event:notifications.onOpenChat", 1, 2]]);
});

test("IPC の登録: 処理か引数の形のないまとまりがあれば（部品の並べ忘れ）登録のときに投げる", () => {
  const ipc: MainIpc = { handle: () => {}, on: () => {} };
  const { diagnostics: _, ...withoutDiagnostics } = ALL_ARGS;
  const handlers = new Proxy({}, { get: () => new Proxy({}, { get: () => () => "ok" }) }) as unknown as IpcHandlers;
  assert.throws(() => registerIpcHandlers(ipc, { table: NATIVE_API, schemas: withoutDiagnostics as unknown as IpcArgSchemas, handlers, trusted: () => true }), /invoke:diagnostics\.start: 引数の形か処理がありません/);
});
