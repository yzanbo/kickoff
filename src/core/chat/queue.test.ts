import assert from "node:assert/strict";
import { test } from "node:test";
import { ChatQueue } from "./queue.js";
import { Store } from "../db/store.js";

function setup() {
  const store = new Store(":memory:");
  const project = store.projects.create({ name: "demo", repo_path: "/tmp/demo", provider: "claude" });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "A", status: "running", model: null });
  return { store, chat };
}

/** 再起動したことにして、保存した列を読み戻す（起動したときに ChatRuntimes がすることと同じ） */
function restarted(store: Store, chatId: number): ChatQueue {
  const queue = new ChatQueue(chatId, () => {}, store.queues);
  const saved = store.queues.list().find((q) => q.chatId === chatId);
  if (saved) queue.restore(saved);
  return queue;
}

test("送信待ち: 変わるたびに保存し、作り直す（再起動する）と読み戻して止めておく。「ここまで」の印も残す", () => {
  const { store, chat } = setup();
  const queue = new ChatQueue(chat.id, () => {}, store.queues);
  const first = queue.add("1 つ目", { model: "opus" }, [{ id: "u1", name: "a.png", mime: "image/png", size: 10 }]);
  const second = queue.add("2 つ目", {}, []);
  queue.add("3 つ目", {}, []);
  queue.move(second.id, 0);
  queue.setStopAfter(first.id);
  assert.equal(queue.isPaused(), false);

  // 再起動: 同じデータベースから読み戻す
  const reloaded = restarted(store, chat.id);
  assert.deepEqual(
    reloaded.list().map((m) => m.text),
    ["2 つ目", "1 つ目", "3 つ目"],
  );
  assert.deepEqual(reloaded.list()[1], first);
  // 前回の作業は中断しているので、勝手に送らず止めておく
  assert.equal(reloaded.isPaused(), true);
  // 「1 つ目」（2 件目）のあとの印は、位置で残る
  assert.deepEqual(reloaded.stopPositions(), [2]);
  // 止めたことも保存する（もう一度再起動しても止めたまま）
  assert.equal(store.queues.list()[0].paused, true);
});

test("送信待ち: 「ここまで送ったら止めます」の印は、動かした・すべて送ったあとも再起動で読み戻す", () => {
  const { store, chat } = setup();
  const queue = new ChatQueue(chat.id, () => {}, store.queues);
  const [, b, c] = ["a", "b", "c"].map((t) => queue.add(t, {}, []));
  // a | b c の c をいちばん上へ（線を越える → c a | b）
  queue.setStops([1]);
  queue.move(c.id, 0);
  assert.deepEqual(restarted(store, chat.id).stopPositions(), [2]);
  // ドラッグで b を線のすぐ上へ落とす（c a b |）
  queue.moveMany([b.id], { before: b.id, belowStop: false });
  assert.deepEqual(restarted(store, chat.id).stopPositions(), [3]);

  // すべて送ったあとの印（次に来た指示の前で止める）は、列が空のまま残す
  queue.setStops([3]);
  for (let i = 0; i < 3; i++) queue.take();
  assert.deepEqual(queue.stopPositions(), [0]);
  // 作業のあいだに次の指示が来れば、その前で止まる
  queue.add("d", {}, []);
  assert.equal(queue.takeNext(), undefined);
  assert.equal(queue.isPaused(), true);
  // 再起動で読み戻しても、止めたまま・印もそのまま
  const reloaded = restarted(store, chat.id);
  assert.deepEqual(reloaded.stopPositions(), [0]);
  assert.equal(reloaded.isPaused(), true);
  // すべて消したら、保存からも消える
  reloaded.clear();
  assert.deepEqual(store.queues.list(), []);
});

test("送信待ち: すべて送ったあとの印は、次の指示が来ないまま作業が終わったら外す（あとで自分で送った作業の送信待ちで止めない）", () => {
  const { store, chat } = setup();
  const queue = new ChatQueue(chat.id, () => {}, store.queues);
  const a = queue.add("a", {}, []);
  queue.setStopAfter(a.id);
  queue.take();
  assert.deepEqual(queue.stopPositions(), [0]);
  // 「a」の作業が終わった: 列は空なので送らず、印も外す
  assert.equal(queue.takeNext(), undefined);
  assert.deepEqual(queue.stopPositions(), []);
  assert.deepEqual(store.queues.list(), []);
  // 次の作業のあいだに来た指示は、いつもどおり自動で送る
  queue.add("b", {}, []);
  assert.equal(queue.takeNext()?.text, "b");

  // 作業の途中でアプリを終えた: 空の列の印は読み戻さない
  queue.setStops([0]);
  assert.deepEqual(restarted(store, chat.id).stopPositions(), []);
});

test("送信待ち: 印は指示とは別の位置で持ち、線をまたがない並べ替えでは動かない。先頭の上の印で止まり、自動に戻すとその印を越える", () => {
  const { store, chat } = setup();
  const queue = new ChatQueue(chat.id, () => {}, store.queues);
  const [a, b, c] = ["a", "b", "c"].map((t) => queue.add(t, {}, []));
  // 1 件目の上と 2 件目のあと
  queue.setStops([2, 0, 2]);
  assert.deepEqual(queue.stopPositions(), [0, 2]);
  assert.deepEqual(restarted(store, chat.id).stopPositions(), [0, 2]);
  // 線をまたがない並べ替え（| a b | c の b をいちばん上へ）では動かない
  queue.move(b.id, 0);
  assert.deepEqual(queue.stopPositions(), [0, 2]);

  // 先頭の上に印があるので、自動では送らずに止めておく（印は残る）
  assert.equal(queue.takeNext(), undefined);
  assert.equal(queue.isPaused(), true);
  assert.deepEqual(queue.stopPositions(), [0, 2]);
  // 自動に戻すと先頭の上の印を越え、次の印まで送る
  queue.setPaused(false);
  assert.deepEqual(queue.stopPositions(), [2]);
  assert.equal(queue.takeNext()?.id, b.id);
  assert.equal(queue.takeNext()?.id, a.id);
  assert.deepEqual(queue.stopPositions(), [0]);
  assert.equal(queue.takeNext(), undefined);
  assert.equal(queue.isPaused(), true);

  // 右クリックの「この指示のあとで止める」: その指示のすぐあと
  queue.setStopAfter(c.id);
  assert.deepEqual(queue.stopPositions(), [0, 1]);
  queue.setStopAfter(c.id, false);
  assert.deepEqual(queue.stopPositions(), [0]);
  assert.equal(queue.setStopAfter("nope"), false);
  // すべて消したら印も外れる
  queue.clear();
  assert.deepEqual(queue.stopPositions(), []);
});

test("送信待ち: 指示を動かすと、動かした指示だけが印の線を越え、ほかの指示は線の同じ側に残る", () => {
  const { chat } = setup();
  const queue = new ChatQueue(chat.id, () => {});
  const [a, b, c, d] = ["a", "b", "c", "d"].map((t) => queue.add(t, {}, []));
  const view = () => {
    const list = queue.list().map((m) => m.text);
    const stops = queue.stopPositions();
    return list.flatMap((t, i) => [...(stops.includes(i) ? ["|"] : []), t]).concat(stops.includes(list.length) ? ["|"] : []).join(" ");
  };
  const reset = () => {
    queue.clear();
    [a, b, c, d].forEach((m) => queue.add(m.text, {}, []));
    queue.setStops([2]);
    return queue.list();
  };
  // いちばん上へ（右クリック）: 線の下の d が線の上へ。b は線の上のまま（以前は b が線の下へ押し出されていた）
  let [qa, , qc, qd] = reset();
  queue.move(qd.id, 0);
  assert.equal(view(), "d a b | c");
  // いちばん下へ: 線の上の a が線の下へ。c は線の下のまま（以前は c が線の上へ引き上げられていた）
  [qa, , qc, qd] = reset();
  queue.move(qa.id, 3);
  assert.equal(view(), "b | c d a");
  // 1 つ上・下へ: すぐ隣が線なら、並びは変えずに線だけを越える
  [qa, , qc, qd] = reset();
  queue.move(qc.id, 1);
  assert.equal(view(), "a b c | d");
  queue.move(qc.id, 3);
  assert.equal(view(), "a b | c d");
  // 隣が指示なら入れ替える（線は動かない）
  queue.move(qd.id, 2);
  assert.equal(view(), "a b | d c");
  // まとめて動かす: いちばん上・いちばん下（1 件目の上・いちばん下の線は端に残る）
  [qa, , qc, qd] = reset();
  queue.moveMany([qc.id, qd.id], "top");
  assert.equal(view(), "c d a b |");
  queue.setStops([0, 2]);
  queue.moveMany([qa.id], "top");
  assert.equal(view(), "| a c d | b");
  // ドラッグで落とした位置: 線のある位置なら、線の上（belowStop: false）か下か
  [qa, , qc, qd] = reset();
  queue.moveMany([qd.id], { before: qc.id, belowStop: false });
  assert.equal(view(), "a b d | c");
  queue.moveMany([qa.id], { before: qc.id, belowStop: true });
  assert.equal(view(), "b d | a c");
});

test("送信待ち: 空になった・チャットを消したら保存からも消える", () => {
  const { store, chat } = setup();
  const queue = new ChatQueue(chat.id, () => {}, store.queues);
  const message = queue.add("1 つ目", {}, []);
  queue.take(message.id);
  assert.equal(store.queues.list().length, 0);

  queue.add("2 つ目", {}, []);
  assert.equal(store.queues.list().length, 1);
  // チャットを消すと、保存した列も一緒に消える
  store.chats.delete(chat.id);
  assert.equal(store.queues.list().length, 0);
  // もうないチャットの列は書かない
  queue.add("3 つ目", {}, []);
  assert.equal(store.queues.list().length, 0);
});

test("送信待ち: 保存先を渡さなければ保存しない", () => {
  const { store, chat } = setup();
  new ChatQueue(chat.id, () => {}).add("1 つ目", {}, []);
  assert.equal(store.queues.list().length, 0);
});
