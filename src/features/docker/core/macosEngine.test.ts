import assert from "node:assert/strict";
import { test } from "vitest";
import { macosDockerStarterOf } from "./macosEngine";

test("macosDockerStarterOf: context の名前から開くアプリ・コピーするコマンド", () => {
  assert.deepEqual(macosDockerStarterOf("orbstack"), { kind: "open", app: "OrbStack", label: "OrbStack を開く" });
  assert.deepEqual(macosDockerStarterOf("desktop-linux"), { kind: "open", app: "Docker", label: "Docker Desktop を開く" });
  assert.deepEqual(macosDockerStarterOf("colima"), { kind: "copy", command: "colima start" });
  assert.deepEqual(macosDockerStarterOf("colima-dev"), { kind: "copy", command: "colima start --profile dev" });
  assert.equal(macosDockerStarterOf("default"), null);
  assert.equal(macosDockerStarterOf(null), null);
});
