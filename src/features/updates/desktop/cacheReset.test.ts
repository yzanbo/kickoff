import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { buildKeyOf, clearCacheIfBuildChanged } from "./cacheReset";

const info = { version: "0.1.0-beta.1", buildNumber: 812, commit: "1a2b3c4", kind: "release" as const };

test("clearCacheIfBuildChanged: 覚えがない・版かコミットが変わったときだけ消し、いまの版を覚える", async () => {
  const userData = tempDir();
  let cleared = 0;
  const run = (i: typeof info) => clearCacheIfBuildChanged({ userData, info: i, clearCache: async () => void cleared++, log: () => {} });
  await run(info);
  assert.equal(cleared, 1);
  await run(info);
  assert.equal(cleared, 1);
  // 手元ビルドは版が同じでも、コミットが変われば別の版
  await run({ ...info, buildNumber: 813, commit: "5d6e7f8", kind: "release" });
  assert.equal(cleared, 2);
  assert.equal(fs.readFileSync(path.join(userData, "last-build.txt"), "utf8").trim(), "0.1.0-beta.1+813.5d6e7f8");
});

test("clearCacheIfBuildChanged: 消せなければ覚えず、次の起動でもう一度消す", async () => {
  const userData = tempDir();
  const logs: string[] = [];
  await clearCacheIfBuildChanged({ userData, info, clearCache: async () => Promise.reject(new Error("busy")), log: (m) => logs.push(m) });
  assert.equal(fs.existsSync(path.join(userData, "last-build.txt")), false);
  assert.match(logs[0], /消せませんでした/);
  assert.equal(buildKeyOf({ ...info, buildNumber: null, commit: null }), "0.1.0-beta.1+-.-");
});
