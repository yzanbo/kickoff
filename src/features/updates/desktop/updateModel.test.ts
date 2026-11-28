import assert from "node:assert/strict";
import { test } from "vitest";
import type { UpdateState } from "@shared/updates/types";
import { blocksCheck, nextUpdateState, type UpdateEvent } from "./updateModel";

const run = (state: UpdateState, ...events: UpdateEvent[]) => events.reduce(nextUpdateState, state);
const idle: UpdateState = { kind: "idle" };
const ready: UpdateState = { kind: "ready", version: "0.1.0-beta.2" };

test("自動の確かめ: 見つけたらダウンロードし、済んだら ready（帯は確かめている間も出さない）", () => {
  assert.deepEqual(run(idle, { type: "checkStarted", manual: false }), idle);
  const downloading = run(idle, { type: "found", version: "0.1.0-beta.2", manual: false, skipped: null });
  assert.deepEqual(downloading, { kind: "downloading", version: "0.1.0-beta.2", percent: 0 });
  assert.deepEqual(run(downloading, { type: "progress", percent: 42.5 }), { kind: "downloading", version: "0.1.0-beta.2", percent: 42.5 });
  assert.deepEqual(run(downloading, { type: "downloaded", version: "0.1.0-beta.2" }), ready);
  // ダウンロードの失敗は何も出さず、次の回にまた確かめる
  assert.deepEqual(run(downloading, { type: "downloadFailed" }), idle);
});

test("自動の確かめ: 通信の失敗は何も出さず、印も消さない。新しい版がなくなったら印を消す", () => {
  assert.deepEqual(run(ready, { type: "checkFailed", manual: false }), ready);
  assert.deepEqual(run(idle, { type: "checkFailed", manual: false }), idle);
  assert.deepEqual(run(ready, { type: "notFound", manual: false }), idle);
  // 同じ版がまた見つかっても、取り直さない
  assert.deepEqual(run(ready, { type: "found", version: "0.1.0-beta.2", manual: false, skipped: null }), ready);
  // もっと新しい版が出たら、そちらを取りに行く
  assert.equal(run(ready, { type: "found", version: "0.1.0-beta.3", manual: false, skipped: null }).kind, "downloading");
});

test("飛ばす: 効くのはその版だけ。自動の確かめでは印を付けず、手で確かめたら取りに行く", () => {
  assert.deepEqual(run(ready, { type: "skipped" }), idle);
  assert.deepEqual(run(idle, { type: "found", version: "0.1.0-beta.2", manual: false, skipped: "0.1.0-beta.2" }), idle);
  assert.equal(run(idle, { type: "found", version: "0.1.0-beta.3", manual: false, skipped: "0.1.0-beta.2" }).kind, "downloading");
  assert.equal(run(idle, { type: "checkStarted", manual: true }, { type: "found", version: "0.1.0-beta.2", manual: true, skipped: "0.1.0-beta.2" }).kind, "downloading");
});

test("手で確かめる: 確認中 → 最新の版です / 確かめられなかった（前に新しい版があれば、その帯に戻す）", () => {
  const checking = run(idle, { type: "checkStarted", manual: true });
  assert.deepEqual(checking, { kind: "checking", previous: idle });
  assert.deepEqual(run(checking, { type: "notFound", manual: true }), { kind: "latest" });
  assert.deepEqual(run(checking, { type: "checkFailed", manual: true }), { kind: "unreachable" });
  const fromReady = run(ready, { type: "checkStarted", manual: true });
  assert.deepEqual(run(fromReady, { type: "checkFailed", manual: true }), ready);
  assert.deepEqual(run(fromReady, { type: "found", version: "0.1.0-beta.2", manual: true, skipped: null }), ready);
  // 確認中に重ねて押しても、前の様子は 1 段だけ持つ
  assert.deepEqual(run(checking, { type: "checkStarted", manual: true }), checking);
});

test("更新して開き直す: 作業中のチャットがあれば待ち、なくなったら入れる。取り消せば ready に戻る", () => {
  assert.deepEqual(run(ready, { type: "installRequested", running: 0 }), { kind: "installing", version: "0.1.0-beta.2" });
  const waiting = run(ready, { type: "installRequested", running: 2 });
  assert.deepEqual(waiting, { kind: "waiting", version: "0.1.0-beta.2", running: 2 });
  assert.deepEqual(run(waiting, { type: "runningChanged", running: 1 }), { kind: "waiting", version: "0.1.0-beta.2", running: 1 });
  assert.deepEqual(run(waiting, { type: "runningChanged", running: 0 }), { kind: "installing", version: "0.1.0-beta.2" });
  assert.deepEqual(run(waiting, { type: "installCancelled" }), ready);
  // 待っていないときの作業中の数は関係ない
  assert.deepEqual(run(ready, { type: "runningChanged", running: 0 }), ready);
});

test("入れられなかった: 入れている途中の失敗だけを failed にし、同じ版は取り直さない", () => {
  const installing: UpdateState = { kind: "installing", version: "0.1.0-beta.2" };
  const failed = run(installing, { type: "installFailed" });
  assert.deepEqual(failed, { kind: "failed", version: "0.1.0-beta.2" });
  assert.deepEqual(run(ready, { type: "installFailed" }), ready);
  assert.deepEqual(run(failed, { type: "found", version: "0.1.0-beta.2", manual: false, skipped: null }), failed);
  assert.deepEqual(run(failed, { type: "skipped" }), idle);
});

test("blocksCheck: ダウンロード中・待っている・入れている間は確かめない", () => {
  assert.equal(blocksCheck({ kind: "downloading", version: "1", percent: 0 }), true);
  assert.equal(blocksCheck({ kind: "waiting", version: "1", running: 1 }), true);
  assert.equal(blocksCheck({ kind: "installing", version: "1" }), true);
  assert.equal(blocksCheck(ready), false);
  assert.equal(blocksCheck({ kind: "failed", version: "1" }), false);
});
