import assert from "node:assert/strict";
import { test } from "vitest";
import { buildFingerprint, compileCacheFolderName, staleCacheFolders } from "./compileCache.js";

const parts = { appVersion: "0.1.0", electron: "45.2.1", arch: "arm64", buildId: "mwi4hsbo" };

test("キャッシュのフォルダ名は アプリの版-Electron の版-arch-ビルドの印", () => {
  assert.equal(compileCacheFolderName(parts), "0.1.0-45.2.1-arm64-mwi4hsbo");
});

test("区切りの - や使えない文字は _ にする（版の -beta などで区切りがずれない）", () => {
  assert.equal(compileCacheFolderName({ ...parts, electron: "46.0.0-beta.1", buildId: "a/b" }), "0.1.0-46.0.0_beta.1-arm64-a_b");
});

test("消すのは、いまのもの以外で Kickoff が作った形の名前のフォルダだけ", () => {
  const current = compileCacheFolderName(parts);
  const older = compileCacheFolderName({ ...parts, buildId: "mwh0aaaa" });
  const oldElectron = compileCacheFolderName({ ...parts, electron: "44.0.0" });
  assert.deepEqual(staleCacheFolders([current, older, oldElectron, ".DS_Store", "notes", "a-b"], current), [older, oldElectron]);
});

test("ビルドの印は束の名前の並びによらず同じで、名前が 1 つ変われば変わる", () => {
  const a = buildFingerprint(["core-HM3Bk68G.js", "run-DIhJt9S_.js"]);
  assert.equal(buildFingerprint(["run-DIhJt9S_.js", "core-HM3Bk68G.js"]), a);
  assert.notEqual(buildFingerprint(["core-AAAAAAAA.js", "run-DIhJt9S_.js"]), a);
  assert.match(a, /^\w+$/);
});
