import assert from "node:assert/strict";
import { test } from "vitest";
import { buildDetail, buildLabel } from "./buildLabel";

test("buildLabel: 配った版はビルド番号と SHA だけ、手元ビルドは添え書きも付ける", () => {
  assert.equal(buildLabel({ version: "0.1.0-beta.1", buildNumber: 812, commit: "1a2b3c4", kind: "release" }), "0.1.0-beta.1（ビルド 812・1a2b3c4）");
  assert.equal(buildLabel({ version: "0.1.0-beta.1", buildNumber: 812, commit: "1a2b3c4", kind: "local" }), "0.1.0-beta.1（ビルド 812・1a2b3c4・手元ビルド）");
  assert.equal(buildLabel({ version: "0.1.0-beta.1", buildNumber: 812, commit: "1a2b3c4", kind: "adhoc" }), "0.1.0-beta.1（ビルド 812・1a2b3c4・手元ビルド・印鑑なし）");
});

test("buildDetail: リポジトリの外で作った配った版は、括弧を付けない", () => {
  assert.equal(buildDetail({ buildNumber: null, commit: null, kind: "release" }), null);
  assert.equal(buildLabel({ version: "1.0.0", buildNumber: null, commit: null, kind: "release" }), "1.0.0");
  assert.equal(buildLabel({ version: "1.0.0", buildNumber: null, commit: null, kind: "dev" }), "1.0.0（開発版）");
});
