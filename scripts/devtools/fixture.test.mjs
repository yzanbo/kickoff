import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { FIXTURE } from "./fixture.mjs";

test("決まったデータの開発版の起動（package.json の dev:fixture）は FIXTURE と同じポート・保存先で electron-vite dev を直接呼ぶ", () => {
  const { scripts } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  assert.equal(scripts["dev:fixture"], `KICKOFF_REMOTE_DEBUG=${FIXTURE.cdp} KICKOFF_PORT=${FIXTURE.api} KICKOFF_USER_DATA_DIR=${FIXTURE.dataDir} electron-vite dev`);
  assert.equal(scripts["fixture:seed"], "node scripts/devtools/fixture.mjs");
});
