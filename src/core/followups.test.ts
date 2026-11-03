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
  assert.equal(restarted.stopAfterOf(run.id), first.id);
  // 止めたことも保存する（もう一度再起動しても止めたまま）
  assert.equal(store.listQueues()[0].paused, true);
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
