import assert from "node:assert/strict";
import { test } from "node:test";
import { bandText, originText, stopTargetText, uptimeText } from "./portsText";

test("uptimeText: 秒・分・時間・日（分からなければ空）", () => {
  assert.equal(uptimeText(30), "30 秒");
  assert.equal(uptimeText(720), "12 分");
  assert.equal(uptimeText(7300), "2 時間");
  assert.equal(uptimeText(3 * 86_400 + 5), "3 日");
  assert.equal(uptimeText(null), "");
});

test("originText: ほかのアプリはアプリの名前を添える", () => {
  assert.equal(originText({ origin: "detached", origin_app: null }), "切り離されている");
  assert.equal(originText({ origin: "other", origin_app: "Visual Studio Code" }), "ほかのアプリ（Visual Studio Code）");
  assert.equal(originText({ origin: "other", origin_app: null }), "ほかのアプリ");
});

test("bandText・stopTargetText", () => {
  assert.equal(bandText({ label: "feat-x", slot: "開発サーバー" }), "feat-x の帯（開発サーバー）");
  assert.equal(bandText({ label: "feat-y", slot: null }), "feat-y の帯");
  assert.equal(stopTargetText({ command: "vite", ports: [5173, 24678] }, "kickoff"), "vite（:5173 :24678・kickoff）");
});
