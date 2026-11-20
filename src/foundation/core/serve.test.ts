import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { test } from "vitest";
import type { CoreFeature, FeatureName } from "@/foundation/core/feature";
import { BASE_SCHEMA_V1 } from "@/foundation/core/db/baseSchema";
import { createKernel } from "@/foundation/core/kernel";
import type { HostPlatform } from "@/foundation/core/platform/types";
import { afterTest } from "@/foundation/core/testing/afterTest";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { serveCore } from "./serve";

const platform = { appDataRoot: "/apps" } as HostPlatform;

/** 呼ばれた順を order に書く偽の機能と土台 */
function fixture() {
  const order: string[] = [];
  const k = createKernel({ dataDir: tempDir(), port: 0, platform, migrations: [{ version: 1, sql: BASE_SCHEMA_V1 }] });
  k.exec.stopAllStreams = () => void order.push("streams");
  const feature = (name: FeatureName, stopPhase?: "first"): CoreFeature => ({
    name,
    api: null,
    stopPhase,
    routes: [{ legacy: (app) => void app.get(`/api/${name}`, (c) => c.json({ name })) }],
    start: () => void order.push(`start:${name}`),
    stop: async () => void order.push(`stop:${name}`),
  });
  const features = [feature("trash"), feature("chat", "first"), feature("docker"), feature("notifications", "first"), feature("voice")];
  return { k, order, assembled: { features, hooks: { deviceMaySee: () => false, status: () => ({ remote_enabled: false, agents: { running: 0 } }) } } };
}

test("serveCore: 待ち受けたら作った順に start、close は先に止める機能 → 流れ続けている外部コマンド → 残りを作った順の逆 → DB", async () => {
  const { k, order, assembled } = fixture();
  const served = await serveCore(k, assembled, { listen: { host: "127.0.0.1", port: 0 } });
  assert.deepEqual(order, ["start:trash", "start:chat", "start:docker", "start:notifications", "start:voice"]);
  // 本体のトークンは保存先に置き、機能のルートは認証のあと
  assert.equal(fs.readFileSync(path.join(k.paths.dataDir, "token"), "utf8"), served.token);
  assert.equal((await served.app.request("/api/docker")).status, 401);
  assert.deepEqual(await (await served.app.request("/api/docker", { headers: { authorization: `Bearer ${served.token}` } })).json(), { name: "docker" });
  order.length = 0;
  await served.close();
  assert.deepEqual(order, ["stop:chat", "stop:notifications", "streams", "stop:voice", "stop:docker", "stop:trash"]);
  assert.throws(() => k.db.prepare("SELECT 1").get());
});

test("serveCore: 待ち受けられなければ start を呼ばずに機能を止めて DB を閉じ、失敗を伝える", async () => {
  const busy = net.createServer();
  await new Promise<void>((resolve) => busy.listen(0, "127.0.0.1", resolve));
  afterTest(() => new Promise<void>((resolve) => busy.close(() => resolve())));
  const { port } = busy.address() as net.AddressInfo;
  const { k, order, assembled } = fixture();
  await assert.rejects(serveCore(k, assembled, { listen: { host: "127.0.0.1", port } }), /EADDRINUSE/);
  assert.deepEqual(order, ["stop:chat", "stop:notifications", "streams", "stop:voice", "stop:docker", "stop:trash"]);
  assert.throws(() => k.db.prepare("SELECT 1").get());
});
