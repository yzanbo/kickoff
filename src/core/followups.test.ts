import assert from "node:assert/strict";
import { test } from "node:test";
import { FollowupQueue } from "./followups.js";
import { Store } from "./store.js";

function setup() {
  const store = new Store(":memory:");
  const project = store.createProject({ name: "demo", repo_path: "/tmp/demo", provider: "claude" });
  const run = store.createRun({ project_id: project.id, provider: "claude", title: "A", status: "running", model: null });
  return { store, run };
}

test("送信待ち: 変わるたびに保存し、作り直す（再起動する）と読み戻して止めておく。「ここまで」の印も残す", () => {
  const { store, run } = setup();
  const queue = new FollowupQueue(() => {}, store);
  const first = queue.add(run.id, "1 つ目", { model: "opus" }, [{ id: "u1", name: "a.png", mime: "image/png", size: 10 }]);
  const second = queue.add(run.id, "2 つ目", {}, []);
  queue.add(run.id, "3 つ目", {}, []);
  queue.move(run.id, second.id, 0);
  queue.setStopAfter(run.id, first.id);
  assert.equal(queue.isPaused(run.id), false);

  // 再起動: 同じデータベースから読み戻す
  const restarted = new FollowupQueue(() => {}, store);
  assert.deepEqual(
    restarted.list(run.id).map((m) => m.text),
    ["2 つ目", "1 つ目", "3 つ目"],
  );
  assert.deepEqual(restarted.list(run.id)[1], first);
  // 前回の作業は中断しているので、勝手に送らず止めておく
  assert.equal(restarted.isPaused(run.id), true);
  // 「1 つ目」（2 件目）のあとの印は、位置で残る
  assert.deepEqual(restarted.stopsOf(run.id), [2]);
  // 止めたことも保存する（もう一度再起動しても止めたまま）
  assert.equal(store.listQueues()[0].paused, true);
});

test("送信待ち: 印は指示とは別の位置で持ち、並べ替えでは動かない。先頭の上の印で止まり、自動に戻すとその印を越える", () => {
  const { store, run } = setup();
  const queue = new FollowupQueue(() => {}, store);
  const [a, b, c] = ["a", "b", "c"].map((t) => queue.add(run.id, t, {}, []));
  // 1 件目の上と 2 件目のあと
  queue.setStops(run.id, [2, 0, 2]);
  assert.deepEqual(queue.stopsOf(run.id), [0, 2]);
  assert.deepEqual(new FollowupQueue(() => {}, store).stopsOf(run.id), [0, 2]);
  // 並べ替えでは動かない
  queue.move(run.id, c.id, 0);
  assert.deepEqual(queue.stopsOf(run.id), [0, 2]);

  // 先頭の上に印があるので、自動では送らずに止めておく（印は残る）
  assert.equal(queue.takeNext(run.id), undefined);
  assert.equal(queue.isPaused(run.id), true);
  assert.deepEqual(queue.stopsOf(run.id), [0, 2]);
  // 自動に戻すと先頭の上の印を越え、次の印まで送る
  queue.setPaused(run.id, false);
  assert.deepEqual(queue.stopsOf(run.id), [2]);
  assert.equal(queue.takeNext(run.id)?.id, c.id);
  assert.equal(queue.takeNext(run.id)?.id, a.id);
  assert.deepEqual(queue.stopsOf(run.id), [0]);
  assert.equal(queue.takeNext(run.id), undefined);
  assert.equal(queue.isPaused(run.id), true);

  // 右クリックの「ここまで自動で送る」: その指示のすぐあと
  queue.setStopAfter(run.id, b.id);
  assert.deepEqual(queue.stopsOf(run.id), [0, 1]);
  queue.setStopAfter(run.id, b.id, false);
  assert.deepEqual(queue.stopsOf(run.id), [0]);
  assert.equal(queue.setStopAfter(run.id, "nope"), false);
  // すべて消したら印も外れる
  queue.clear(run.id);
  assert.deepEqual(queue.stopsOf(run.id), []);
});

test("送信待ち: 空になった・チャットを消したら保存からも消える", () => {
  const { store, run } = setup();
  const queue = new FollowupQueue(() => {}, store);
  const message = queue.add(run.id, "1 つ目", {}, []);
  queue.take(run.id, message.id);
  assert.equal(store.listQueues().length, 0);

  queue.add(run.id, "2 つ目", {}, []);
  store.deleteRun(run.id);
  queue.forget(run.id);
  assert.equal(store.listQueues().length, 0);
  // もうないチャットの列は書かない
  queue.add(run.id, "3 つ目", {}, []);
  assert.equal(store.listQueues().length, 0);
});

test("送信待ち: 保存先を渡さなければ保存しない", () => {
  const { store, run } = setup();
  new FollowupQueue(() => {}).add(run.id, "1 つ目", {}, []);
  assert.equal(store.listQueues().length, 0);
});
