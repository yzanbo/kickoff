import assert from "node:assert/strict";
import { test } from "vitest";
import { createKernel } from "@/foundation/core/kernel";
import { stopFeatures } from "@/foundation/core/serve";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { assembleCore } from "./assemble";
import { MIGRATIONS } from "./migrations";
import { ALL_SETTINGS } from "@/app/shared/settings";
import { testEnv, testFakes, testPlatform } from "./testing/testEnv";

test("組み立てた機能を止める順: 通知 → エージェント（チャット）→ 流れ続けている外部コマンド → 残りの機能を作った順の逆", async () => {
  const dataDir = tempDir();
  const fakes = testFakes(dataDir);
  const k = createKernel({ dataDir, port: 0, platform: testPlatform(fakes), dbFile: ":memory:", migrations: MIGRATIONS, settings: ALL_SETTINGS });
  const { features } = assembleCore(k, testEnv(fakes));
  const order: string[] = [];
  k.exec.stopAllStreams = () => void order.push("streams");
  const recorded = features.map((f) => ({ ...f, stop: async () => (order.push(f.name), await f.stop?.()) }));
  await stopFeatures(k, recorded);
  const rest = ["ports", "browser", "terminal", "database", "notes", "github", "worktrees", "docker", "git", "files", "queue", "workplaceMove", "providerSwitch", "remoteImages", "visuals", "childChats", "subagents", "compact", "guard"];
  assert.deepEqual(order, ["notifications", "chat", "streams", ...rest, "devices", "voice", "userView", "snippets", "attachments", "ai", "groups", "projects", "trash", "settings"]);
});
