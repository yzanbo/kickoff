import assert from "node:assert/strict";
import { test } from "vitest";
import { DEVELOPMENT_BUNDLE_ID, parseCdhash, PRODUCTION_BUNDLE_ID } from "./mac-privacy.mjs";

test("codesign -dvvv の出力から cdhash を取り出す", () => {
  const output = [
    "Executable=/tmp/Example.app/Contents/MacOS/Example",
    "Identifier=app.kickoff.desktop",
    "CandidateCDHash sha256=a101f8244f0ba6c27cdc0f164db6e35328c63dd4",
    "CDHash=a101f8244f0ba6c27cdc0f164db6e35328c63dd4",
    "Signature=adhoc",
  ].join("\n");
  assert.equal(parseCdhash(output), "a101f8244f0ba6c27cdc0f164db6e35328c63dd4");
});

test("署名がないときは null", () => {
  assert.equal(parseCdhash("/tmp/x.app: code object is not signed at all\n"), null);
  assert.equal(parseCdhash(""), null);
});

test("開発版の ID は製品版と別で、製品版の ID から作る", () => {
  assert.notEqual(DEVELOPMENT_BUNDLE_ID, PRODUCTION_BUNDLE_ID);
  assert.ok(DEVELOPMENT_BUNDLE_ID.startsWith(`${PRODUCTION_BUNDLE_ID}.`));
});
