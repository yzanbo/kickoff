import assert from "node:assert/strict";
import { test } from "vitest";
import { parse } from "yaml";
import { dirtyProblem, fusesProblem, isPrerelease, releaseAssetUrl, releaseTagOf, rewriteLatestMac } from "./release.mjs";

test("releaseTagOf・isPrerelease: semver の版だけを受け、β 版はプレリリース", () => {
  assert.equal(releaseTagOf("0.1.0-beta.1"), "v0.1.0-beta.1");
  assert.throws(() => releaseTagOf("0.1"), /semver/);
  assert.equal(isPrerelease("0.1.0-beta.1"), true);
  assert.equal(isPrerelease("1.0.0"), false);
});

test("rewriteLatestMac: zip・dmg の場所を Releases の URL にし、指紋と大きさは変えない", () => {
  const text = [
    "version: 0.1.0-beta.2",
    "files:",
    "  - url: Kickoff-0.1.0-beta.2-arm64-mac.zip",
    "    sha512: abc==",
    "    size: 10",
    "path: Kickoff-0.1.0-beta.2-arm64-mac.zip",
    "sha512: abc==",
    "releaseDate: '2026-11-28T03:27:03.821Z'",
  ].join("\n");
  const out = parse(rewriteLatestMac(text, { repo: "nexy-apps/kickoff", tag: "v0.1.0-beta.2" }));
  const url = "https://github.com/nexy-apps/kickoff/releases/download/v0.1.0-beta.2/Kickoff-0.1.0-beta.2-arm64-mac.zip";
  assert.deepEqual(out.files, [{ url, sha512: "abc==", size: 10 }]);
  assert.equal(out.path, url);
  assert.equal(out.sha512, "abc==");
  assert.equal(out.version, "0.1.0-beta.2");
  assert.throws(() => rewriteLatestMac("version: 1.0.0\n", { repo: "a/b", tag: "v1.0.0" }), /形が違います/);
  assert.throws(() => releaseAssetUrl("a/b", "v1", "Kickoff 1.zip"), /空白/);
});

test("fusesProblem: 決まりの fuses がそろっていなければ止める", () => {
  const good = [
    "Fuse Version: v1",
    "  RunAsNode is Disabled",
    "  EnableCookieEncryption is Disabled",
    "  EnableNodeOptionsEnvironmentVariable is Disabled",
    "  EnableNodeCliInspectArguments is Disabled",
    "  EnableEmbeddedAsarIntegrityValidation is Enabled",
    "  OnlyLoadAppFromAsar is Enabled",
  ].join("\n");
  assert.equal(fusesProblem(good), null);
  assert.match(fusesProblem(good.replace("RunAsNode is Disabled", "RunAsNode is Enabled")) ?? "", /RunAsNode（Enabled/);
  assert.match(fusesProblem("") ?? "", /なし/);
});

test("dirtyProblem: コミットしていない変更があれば止める", () => {
  assert.equal(dirtyProblem(""), null);
  assert.match(dirtyProblem(" M package.json\n?? a.txt\n") ?? "", /2 件/);
});
