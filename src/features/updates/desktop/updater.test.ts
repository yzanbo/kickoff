import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "vitest";
import { manualClock } from "@/foundation/core/testing/manualClock";
import { until } from "@/foundation/core/testing/until";
import type { UpdatePrefs, UpdateState } from "@shared/updates/types";
import { CHECK_INTERVAL_MS, createUpdateController, FIRST_CHECK_MS, MIN_CHECKING_MS } from "./updater";

/** 偽の electron-updater（見つける版・失敗を決めて、呼ばれた操作を覚える） */
function fakeUpdater() {
  const events = new EventEmitter();
  const calls: string[] = [];
  const port = {
    latest: null as string | null,
    failCheck: false,
    async checkForUpdates() {
      calls.push("check");
      if (port.failCheck) throw new Error("ENOTFOUND");
      return port.latest ? { isUpdateAvailable: true, updateInfo: { version: port.latest } } : { isUpdateAvailable: false, updateInfo: { version: "0.1.0-beta.1" } };
    },
    async downloadUpdate() {
      calls.push("download");
      events.emit("download-progress", { percent: 50 });
      events.emit("update-downloaded", { version: port.latest });
    },
    quitAndInstall: () => void calls.push("install"),
    on: (event: string, fn: Parameters<EventEmitter["on"]>[1]) => events.on(event, fn),
  };
  return { port, calls, events };
}

function setup(prefs: UpdatePrefs | null = { autoCheck: true, skippedVersion: null }) {
  const clock = manualClock();
  const updater = fakeUpdater();
  const states: UpdateState[] = [];
  let running = 0;
  const runningListeners = new Set<(n: number) => void>();
  const controller = createUpdateController({
    port: updater.port,
    clock,
    prefs: async () => prefs,
    running: () => running,
    onRunning: (fn) => {
      runningListeners.add(fn);
      return () => runningListeners.delete(fn);
    },
    publish: (s) => states.push(s),
    log: () => {},
  });
  /** 手で確かめ、「確認中…」の待ちを進めて終わりまで待つ */
  const manualCheck = async () => {
    const before = clock.pending;
    const done = controller.check(true);
    await until(() => clock.pending === before + 1);
    await clock.advance(MIN_CHECKING_MS);
    await done;
  };
  const setRunning = (n: number) => {
    running = n;
    for (const fn of runningListeners) fn(n);
  };
  return { clock, controller, updater, states, setRunning, runningListeners, manualCheck };
}

test("起動して少しあとと 1 時間ごとに確かめ、見つけたら裏でダウンロードして ready にする", async () => {
  const { clock, controller, updater } = setup();
  controller.start();
  await clock.advance(FIRST_CHECK_MS - 1);
  assert.deepEqual(updater.calls, []);
  await clock.advance(1);
  await until(() => updater.calls.length === 1);
  assert.equal(controller.state().kind, "idle");
  updater.port.latest = "0.1.0-beta.2";
  await clock.advance(CHECK_INTERVAL_MS);
  await until(() => controller.state().kind === "ready");
  assert.deepEqual(updater.calls, ["check", "check", "download"]);
  controller.stop();
});

test("自動で確かめる設定を切っている・設定を読めないときは、自動では確かめない（手では確かめられる）", async () => {
  for (const prefs of [{ autoCheck: false, skippedVersion: null }, null]) {
    const { clock, controller, updater, manualCheck } = setup(prefs);
    controller.start();
    await clock.advance(FIRST_CHECK_MS);
    await clock.advance(CHECK_INTERVAL_MS);
    assert.deepEqual(updater.calls, []);
    await manualCheck();
    assert.deepEqual(updater.calls, ["check"]);
    assert.equal(controller.state().kind, "latest");
    controller.stop();
  }
});

test("手で確かめると「確認中…」を少なくとも 0.5 秒出し、つながらなければ確かめられなかったと出す", async () => {
  const { clock, controller, updater, states } = setup();
  updater.port.failCheck = true;
  const manual = controller.check(true);
  await until(() => updater.calls.length === 1);
  assert.equal(controller.state().kind, "checking");
  await clock.advance(MIN_CHECKING_MS - 1);
  assert.equal(controller.state().kind, "checking");
  await clock.advance(1);
  await manual;
  assert.deepEqual(states.map((s) => s.kind), ["checking", "unreachable"]);
});

test("飛ばした版は自動の確かめで取りに行かない", async () => {
  const { clock, controller, updater } = setup({ autoCheck: true, skippedVersion: "0.1.0-beta.2" });
  updater.port.latest = "0.1.0-beta.2";
  controller.start();
  await clock.advance(FIRST_CHECK_MS);
  await until(() => updater.calls.length === 1);
  assert.equal(controller.state().kind, "idle");
  assert.deepEqual(updater.calls, ["check"]);
  controller.stop();
});

test("更新して開き直す: 作業中のチャットがなくなってから入れ、取り消せば待つのをやめる", async () => {
  const { controller, updater, setRunning, runningListeners, manualCheck } = setup();
  updater.port.latest = "0.1.0-beta.2";
  await manualCheck();
  await until(() => controller.state().kind === "ready");
  setRunning(2);
  controller.requestInstall();
  assert.deepEqual(controller.state(), { kind: "waiting", version: "0.1.0-beta.2", running: 2 });
  controller.cancelInstall();
  assert.equal(controller.state().kind, "ready");
  assert.equal(runningListeners.size, 0);
  controller.requestInstall();
  setRunning(1);
  assert.equal(updater.calls.includes("install"), false);
  setRunning(0);
  assert.equal(controller.state().kind, "installing");
  assert.equal(updater.calls.filter((c) => c === "install").length, 1);
  assert.equal(runningListeners.size, 0);
  // Squirrel が印鑑の違う版を断ったら error で届き、アプリは終わらない
  updater.events.emit("error", new Error("code failed to satisfy specified code requirement(s)"));
  assert.deepEqual(controller.state(), { kind: "failed", version: "0.1.0-beta.2" });
});

test("確かめ・ダウンロードの失敗の error は、入れていないときは何も変えない", async () => {
  const { controller, updater } = setup();
  updater.events.emit("error", new Error("net::ERR_INTERNET_DISCONNECTED"));
  assert.equal(controller.state().kind, "idle");
});
