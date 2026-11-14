import assert from "node:assert/strict";
import { test } from "node:test";
import { HostRegistry, hostNameOf, type HostRecord, type SecretStore } from "./hosts";

function memoryStore(): SecretStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItemAsync: async (k) => data.get(k) ?? null,
    setItemAsync: async (k, v) => void data.set(k, v),
    deleteItemAsync: async (k) => void data.delete(k),
  };
}

const record = (host_id: string, url: string): HostRecord => ({ host_id, url, name: hostNameOf(url), device_id: 1, access: "full", paired_at: "2026-11-14T00:00:00Z" });

test("HostRegistry: 本体ごとに足し、トークンは別のキーに置く。同じ本体はつなぎ直しで置き換え、外すとトークンも消す", async () => {
  const store = memoryStore();
  const hosts = new HostRegistry(store);
  assert.deepEqual(await hosts.list(), []);
  await hosts.add(record("mac-1", "https://mac.tailnet.ts.net"), "t1");
  await hosts.add(record("win-2", "https://win.tailnet.ts.net"), "t2");
  await hosts.add({ ...record("mac-1", "https://mac.tailnet.ts.net:8443"), device_id: 5 }, "t3");
  const list = await hosts.list();
  assert.deepEqual(list.map((h) => [h.host_id, h.url, h.device_id]), [
    ["win-2", "https://win.tailnet.ts.net", 1],
    ["mac-1", "https://mac.tailnet.ts.net:8443", 5],
  ]);
  assert.equal(await hosts.token("mac-1"), "t3");
  // 一覧の中にトークンは入れない
  assert.ok(!store.data.get("kickoff.hosts")!.includes("t3"));
  await hosts.update("win-2", { access: "read" });
  assert.equal((await hosts.list()).find((h) => h.host_id === "win-2")?.access, "read");
  await hosts.remove("mac-1");
  assert.equal(await hosts.token("mac-1"), null);
  assert.deepEqual((await hosts.list()).map((h) => h.host_id), ["win-2"]);
});

test("hostNameOf: URL のホスト名の最初の段", () => {
  assert.equal(hostNameOf("https://mac.tailnet.ts.net:8443"), "mac");
  assert.equal(hostNameOf("bad"), "bad");
});
