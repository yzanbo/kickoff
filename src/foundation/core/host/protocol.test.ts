import { test } from "vitest";
import assert from "node:assert/strict";
import { RPC_TIMEOUTS, prefixedClient, prefixedHandlers, timeoutOf } from "./protocol";

test("RPC の時間の上限: 名前 → まとまり（<group>.*）→ default の順に引き、null は上限なし", () => {
  assert.equal(timeoutOf(RPC_TIMEOUTS, "ping"), 5_000);
  assert.equal(timeoutOf(RPC_TIMEOUTS, "runningChats"), 1_000);
  assert.equal(timeoutOf(RPC_TIMEOUTS, "close"), 4_500);
  assert.equal(timeoutOf(RPC_TIMEOUTS, "browser.read"), 120_000);
  assert.equal(timeoutOf(RPC_TIMEOUTS, "dbWorker.spawn"), 10_000);
  assert.equal(timeoutOf(RPC_TIMEOUTS, "secret.decrypt"), null);
  assert.equal(timeoutOf(RPC_TIMEOUTS, "diagnostics.stop"), null);
  assert.equal(timeoutOf(RPC_TIMEOUTS, "terminal.closeOwnedBy"), 30_000);
  assert.equal(timeoutOf(RPC_TIMEOUTS, "metrics"), 30_000);
});

interface Greeter {
  hello(name: string): Promise<string>;
  wave(times: number): Promise<number>;
  touched(id: number): void;
}

test("頭を付けた写し: 呼ぶ口は <group>.<名前> を呼び、emit の名前は知らせを送る。受ける口は impl のメソッドとして呼ぶ", async () => {
  const calls: unknown[][] = [];
  const events: unknown[][] = [];
  const rpc = {
    call: async (method: string, ...args: unknown[]) => (calls.push([method, ...args]), `${method}:${args.join(",")}`),
    emit: (name: string, payload: unknown) => void events.push([name, payload]),
  };
  const client = prefixedClient<Greeter>(rpc, "g", ["hello", "wave"], { emit: ["touched"] });
  assert.equal(await client.hello("a"), "g.hello:a");
  await client.wave(2);
  client.touched(7);
  assert.deepEqual(calls, [["g.hello", "a"], ["g.wave", 2]]);
  assert.deepEqual(events, [["g.touched", 7]]);

  const impl = { prefix: "やあ", hello(name: string) { return Promise.resolve(`${this.prefix} ${name}`); }, wave: async (n: number) => n * 2, touched: () => {} };
  const handlers = prefixedHandlers("g", impl, ["hello", "wave"]);
  assert.deepEqual(Object.keys(handlers), ["g.hello", "g.wave"]);
  assert.equal(await handlers["g.hello"]("b"), "やあ b");
  assert.equal(await handlers["g.wave"](3), 6);
});
