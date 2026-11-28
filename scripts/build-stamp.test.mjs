import assert from "node:assert/strict";
import { test } from "vitest";
import { buildKindOf, parseBuildNumber, readBuildStamp } from "./build-stamp.mjs";
import { BUILD_KINDS } from "../src/shared/updates/types";

test("buildKindOf: 付けなければ dev、知らない値は止める", () => {
  assert.equal(buildKindOf(undefined), "dev");
  assert.equal(buildKindOf(""), "dev");
  for (const kind of BUILD_KINDS) assert.equal(buildKindOf(kind), kind);
  assert.throws(() => buildKindOf("signed"), /KICKOFF_BUILD_KIND/);
});

test("parseBuildNumber: コミットの数だけを受ける", () => {
  assert.equal(parseBuildNumber("812\n"), 812);
  assert.equal(parseBuildNumber(""), null);
  assert.equal(parseBuildNumber("fatal"), null);
});

test("readBuildStamp: このリポジトリではビルド番号と短い SHA が入る", () => {
  const stamp = readBuildStamp(process.cwd(), {});
  assert.equal(stamp.kind, "dev");
  assert.ok(stamp.buildNumber !== null && stamp.buildNumber > 0);
  assert.match(stamp.commit ?? "", /^[0-9a-f]{7,}$/);
});
