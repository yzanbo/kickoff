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

test("送信待ち: 「ここまで送ったら止めます」の印は、動かした・すべて送ったあとも再起動で読み戻す", () => {
  const { store, run } = setup();
  const queue = new FollowupQueue(() => {}, store);
  const [, b, c] = ["a", "b", "c"].map((t) => queue.add(run.id, t, {}, []));
  // a | b c の c をいちばん上へ（線を越える → c a | b）
  queue.setStops(run.id, [1]);
  queue.move(run.id, c.id, 0);
  assert.deepEqual(new FollowupQueue(() => {}, store).stopsOf(run.id), [2]);
  // ドラッグで b を線のすぐ上へ落とす（c a b |）
  queue.moveMany(run.id, [b.id], { before: b.id, belowStop: false });
  assert.deepEqual(new FollowupQueue(() => {}, store).stopsOf(run.id), [3]);

  // すべて送ったあとの印（次に来た指示の前で止める）も、列が空のまま残す
  queue.setStops(run.id, [3]);
  for (let i = 0; i < 3; i++) queue.take(run.id);
  assert.deepEqual(queue.stopsOf(run.id), [0]);
  const restarted = new FollowupQueue(() => {}, store);
  assert.deepEqual(restarted.stopsOf(run.id), [0]);
  // 止めておく指示はないので、止めておくにはしない。次に来た指示の前で止まる
  assert.equal(restarted.isPaused(run.id), false);
  restarted.add(run.id, "d", {}, []);
  assert.equal(restarted.takeNext(run.id), undefined);
  assert.equal(restarted.isPaused(run.id), true);
  // すべて消したら、保存からも消える
  restarted.clear(run.id);
  assert.deepEqual(store.listQueues(), []);
});

test("送信待ち: 印は指示とは別の位置で持ち、線をまたがない並べ替えでは動かない。先頭の上の印で止まり、自動に戻すとその印を越える", () => {
  const { store, run } = setup();
  const queue = new FollowupQueue(() => {}, store);
  const [a, b, c] = ["a", "b", "c"].map((t) => queue.add(run.id, t, {}, []));
  // 1 件目の上と 2 件目のあと
  queue.setStops(run.id, [2, 0, 2]);
  assert.deepEqual(queue.stopsOf(run.id), [0, 2]);
  assert.deepEqual(new FollowupQueue(() => {}, store).stopsOf(run.id), [0, 2]);
  // 線をまたがない並べ替え（| a b | c の b をいちばん上へ）では動かない
  queue.move(run.id, b.id, 0);
  assert.deepEqual(queue.stopsOf(run.id), [0, 2]);

  // 先頭の上に印があるので、自動では送らずに止めておく（印は残る）
  assert.equal(queue.takeNext(run.id), undefined);
  assert.equal(queue.isPaused(run.id), true);
  assert.deepEqual(queue.stopsOf(run.id), [0, 2]);
  // 自動に戻すと先頭の上の印を越え、次の印まで送る
  queue.setPaused(run.id, false);
  assert.deepEqual(queue.stopsOf(run.id), [2]);
  assert.equal(queue.takeNext(run.id)?.id, b.id);
  assert.equal(queue.takeNext(run.id)?.id, a.id);
  assert.deepEqual(queue.stopsOf(run.id), [0]);
  assert.equal(queue.takeNext(run.id), undefined);
  assert.equal(queue.isPaused(run.id), true);

  // 右クリックの「この指示のあとで止める」: その指示のすぐあと
  queue.setStopAfter(run.id, c.id);
  assert.deepEqual(queue.stopsOf(run.id), [0, 1]);
  queue.setStopAfter(run.id, c.id, false);
  assert.deepEqual(queue.stopsOf(run.id), [0]);
  assert.equal(queue.setStopAfter(run.id, "nope"), false);
  // すべて消したら印も外れる
  queue.clear(run.id);
  assert.deepEqual(queue.stopsOf(run.id), []);
});

test("送信待ち: 指示を動かすと、動かした指示だけが印の線を越え、ほかの指示は線の同じ側に残る", () => {
  const { run } = setup();
  const queue = new FollowupQueue(() => {});
  const [a, b, c, d] = ["a", "b", "c", "d"].map((t) => queue.add(run.id, t, {}, []));
  const view = () => {
    const list = queue.list(run.id).map((m) => m.text);
    const stops = queue.stopsOf(run.id);
    return list.flatMap((t, i) => [...(stops.includes(i) ? ["|"] : []), t]).concat(stops.includes(list.length) ? ["|"] : []).join(" ");
  };
  const reset = () => {
    queue.clear(run.id);
    [a, b, c, d].forEach((m) => queue.add(run.id, m.text, {}, []));
    queue.setStops(run.id, [2]);
    return queue.list(run.id);
  };
  // いちばん上へ（右クリック）: 線の下の d が線の上へ。b は線の上のまま（以前は b が線の下へ押し出されていた）
  let [qa, , qc, qd] = reset();
  queue.move(run.id, qd.id, 0);
  assert.equal(view(), "d a b | c");
  // いちばん下へ: 線の上の a が線の下へ。c は線の下のまま（以前は c が線の上へ引き上げられていた）
  [qa, , qc, qd] = reset();
  queue.move(run.id, qa.id, 3);
  assert.equal(view(), "b | c d a");
  // 1 つ上・下へ: すぐ隣が線なら、並びは変えずに線だけを越える
  [qa, , qc, qd] = reset();
  queue.move(run.id, qc.id, 1);
  assert.equal(view(), "a b c | d");
  queue.move(run.id, qc.id, 3);
  assert.equal(view(), "a b | c d");
  // 隣が指示なら入れ替える（線は動かない）
  queue.move(run.id, qd.id, 2);
  assert.equal(view(), "a b | d c");
  // まとめて動かす: いちばん上・いちばん下（1 件目の上・いちばん下の線は端に残る）
  [qa, , qc, qd] = reset();
  queue.moveMany(run.id, [qc.id, qd.id], "top");
  assert.equal(view(), "c d a b |");
  queue.setStops(run.id, [0, 2]);
  queue.moveMany(run.id, [qa.id], "top");
  assert.equal(view(), "| a c d | b");
  // ドラッグで落とした位置: 線のある位置なら、線の上（belowStop: false）か下か
  [qa, , qc, qd] = reset();
  queue.moveMany(run.id, [qd.id], { before: qc.id, belowStop: false });
  assert.equal(view(), "a b d | c");
  queue.moveMany(run.id, [qa.id], { before: qc.id, belowStop: true });
  assert.equal(view(), "b d | a c");
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
