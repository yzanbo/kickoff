import assert from "node:assert/strict";
import { MessageChannel } from "node:worker_threads";
import { test } from "vitest";
import type { BrowserControl } from "@shared/browser/control";
import { afterTest } from "@/foundation/core/testing/afterTest";
import { until } from "@/app/core/testing/testCore";
import type { CoreEvents, CoreMethods, HostEvents, HostMethods } from "@/foundation/core/host/protocol";
import { nodeRpcPort } from "@/foundation/core/host/ports";
import { createRpc } from "@/foundation/core/host/rpc";
import { hostDbWorker, remoteBrowser, stringEnv } from "./hostRemote";

function pair() {
  const { port1, port2 } = new MessageChannel();
  afterTest(() => {
    port1.close();
    port2.close();
  });
  return { hostPort: nodeRpcPort(port1), corePort: nodeRpcPort(port2), port1 };
}

test("remoteBrowser: BrowserControl のすべての操作を RPC に写し、失敗の文はそのまま返る。touch は返事のない知らせ", async () => {
  const { hostPort, corePort } = pair();
  const calls: unknown[][] = [];
  const tab = { id: 1, project_id: 2, url: "http://localhost:5173/", title: "app", loading: false };
  const record =
    (name: string, value: unknown) =>
    async (...args: unknown[]) => (calls.push([name, ...args]), value);
  const handlers = {
    "browser.tabs": record("tabs", [tab]),
    "browser.open": record("open", { tab, revealed: true }),
    "browser.reveal": record("reveal", true),
    "browser.navigate": record("navigate", tab),
    "browser.history": record("history", tab),
    "browser.read": record("read", { url: "u", title: "t", elements: [], text: "", scroll: { y: 0, height: 0, viewport: 0 } }),
    "browser.screenshot": record("screenshot", { data: "AA", mimeType: "image/jpeg" }),
    "browser.click": record("click", "押しました"),
    "browser.type": record("type", "打ちました"),
    "browser.press": record("press", "送りました"),
    "browser.scroll": record("scroll", "下へ"),
    "browser.evaluate": async () => {
      throw new Error("tab_id=9 のタブはありません（閉じられた可能性があります）");
    },
    "browser.consoleLogs": record("consoleLogs", ["[log] hi"]),
  };
  const host = createRpc<HostMethods, CoreMethods, HostEvents, CoreEvents>(hostPort, { handlers: handlers as never });
  const touched: number[] = [];
  host.on("browser.touch", (id) => touched.push(id));
  const browser: BrowserControl = remoteBrowser(createRpc<CoreMethods, HostMethods, CoreEvents, HostEvents>(corePort, { handlers: {} as never }));

  assert.deepEqual(await browser.tabs(), [tab]);
  assert.deepEqual(await browser.open(2, "http://localhost:5173/", { after: null }), { tab, revealed: true });
  assert.equal(await browser.reveal(1, { after: 3 }), true);
  await browser.navigate(1, "http://x/");
  await browser.history(1, "back");
  await browser.read(1);
  assert.deepEqual(await browser.screenshot(1), { data: "AA", mimeType: "image/jpeg" });
  assert.equal(await browser.click(1, 4), "押しました");
  assert.equal(await browser.type(1, 4, "abc", true), "打ちました");
  assert.equal(await browser.press(1, "Enter"), "送りました");
  assert.equal(await browser.scroll(1, "down"), "下へ");
  assert.deepEqual(await browser.consoleLogs(1), ["[log] hi"]);
  await assert.rejects(browser.evaluate(9, "1"), (e: Error) => e.message === "tab_id=9 のタブはありません（閉じられた可能性があります）");
  browser.touch(1);
  await until(() => touched.length === 1);
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["tabs", "open", "reveal", "navigate", "history", "read", "screenshot", "click", "type", "press", "scroll", "consoleLogs"],
  );
  assert.deepEqual(calls[1], ["open", 2, "http://localhost:5173/", { after: null }]);
  assert.deepEqual(calls[8], ["type", 1, 4, "abc", true]);
});

test("hostDbWorker: 起動を頼むときにその時の env を渡し、口が届く前に送ったものはためて、届いたら順に送る。止めるとメインに kill を頼む", async () => {
  const { hostPort, corePort } = pair();
  const spawned: Record<string, string>[] = [];
  const killed: number[] = [];
  const worker = new MessageChannel();
  afterTest(() => {
    worker.port1.close();
    worker.port2.close();
  });
  const workerGot: unknown[] = [];
  worker.port2.on("message", (m: unknown) => workerGot.push(m));
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  createRpc<HostMethods, CoreMethods, HostEvents, CoreEvents>(hostPort, {
    handlers: {
      "dbWorker.spawn": async (env: Record<string, string>) => {
        spawned.push(env);
        await gate;
        // 番号より先に口を送る（メインの順と同じ）
        hostPort.post({ t: "port", purpose: "dbWorker", workerId: 7 }, [worker.port1]);
        return 7;
      },
      "dbWorker.kill": async (id: number) => void killed.push(id),
    } as never,
  });
  const rpc = createRpc<CoreMethods, HostMethods, CoreEvents, HostEvents>(corePort, { handlers: {} as never });
  let env: NodeJS.ProcessEnv = { PATH: "/first" };
  const spawn = hostDbWorker(rpc, corePort, { env: () => env });
  env = { PATH: "/opt/homebrew/bin:/usr/bin", NUM: undefined };
  const channel = spawn();
  const answers: unknown[] = [];
  channel.onMessage((m) => answers.push(m));
  channel.send({ id: 1, method: "ping", params: {} } as never);
  channel.send({ id: 2, method: "ping", params: {} } as never);
  await until(() => spawned.length === 1);
  assert.deepEqual(spawned[0], { PATH: "/opt/homebrew/bin:/usr/bin" });
  assert.equal(workerGot.length, 0);
  release();
  await until(() => workerGot.length === 2);
  assert.deepEqual(
    workerGot.map((m) => (m as { id: number }).id),
    [1, 2],
  );
  // ワーカーからの答えは onMessage に届く
  worker.port2.postMessage({ id: 1, ok: true, result: "pong" });
  await until(() => answers.length === 1);
  assert.deepEqual(answers[0], { id: 1, ok: true, result: "pong" });
  channel.kill();
  await until(() => killed.length === 1);
  assert.deepEqual(killed, [7]);
});

test("hostDbWorker: メインがワーカーの終わりを知らせたら onExit（自分で止めたときは呼ばない）", async () => {
  const { hostPort, corePort } = pair();
  const extra = new MessageChannel();
  afterTest(() => {
    extra.port1.close();
    extra.port2.close();
  });
  let spawned = false;
  const host = createRpc<HostMethods, CoreMethods, HostEvents, CoreEvents>(hostPort, {
    handlers: {
      "dbWorker.spawn": async () => (hostPort.post({ t: "port", purpose: "dbWorker", workerId: 3 }, [extra.port1]), (spawned = true), 3),
      "dbWorker.kill": async () => {},
    } as never,
  });
  const rpc = createRpc<CoreMethods, HostMethods, CoreEvents, HostEvents>(corePort, { handlers: {} as never });
  const channel = hostDbWorker(rpc, corePort)();
  const reasons: string[] = [];
  channel.onExit((r) => reasons.push(r));
  channel.send({ id: 1, method: "ping", params: {} } as never);
  // 起こした答え（ワーカーの番号）を返してから終わりを知らせる（同じポートなので答えが先に届く）
  await until(() => spawned);
  host.emit("dbWorker.exit", { workerId: 4, reason: "ほかのワーカー" });
  host.emit("dbWorker.exit", { workerId: 3, reason: "終了コード 9" });
  await until(() => reasons.length === 1);
  assert.deepEqual(reasons, ["終了コード 9"]);
});

test("stringEnv: 値のある環境変数だけを渡す", () => {
  assert.deepEqual(stringEnv({ A: "1", B: undefined }), { A: "1" });
});
