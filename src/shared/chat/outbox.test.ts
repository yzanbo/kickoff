import assert from "node:assert/strict";
import { test } from "vitest";
import { addAction, addLater, EMPTY_OUTBOX, mergeLater, moveMany, moveOne, newMessage, placeContinuation, reserve, restoreOutbox, setPaused, setStopAfter, setStops, takeLater, takeNext, clearLater, type Outbox } from "./outbox";
import type { QueuedMessage } from "./types";

/** 決まった時刻と、q1・q2… の ID */
function envOf() {
  let n = 0;
  return { now: "2026-11-22T00:00:00.000Z", newId: () => `q${++n}` };
}

/** 文を送信待ちの下に足していった箱と、足した行 */
function filled(texts: string[]): { box: Outbox; rows: QueuedMessage[]; env: ReturnType<typeof envOf> } {
  const env = envOf();
  const rows = texts.map((t) => newMessage(env, t, {}, []));
  return { box: rows.reduce(addLater, EMPTY_OUTBOX), rows, env };
}

/** 送信待ちの見た目（線は |） */
function view(box: Outbox): string {
  const list = box.later.map((m) => (m.compact ? "圧縮" : m.text));
  return list.flatMap((t, i) => [...box.stops.filter((k) => k === i).map(() => "|"), t]).concat(box.stops.filter((k) => k === list.length).map(() => "|")).join(" ");
}

test("出す箱: 読み戻すと止めておくか・線は保存したまま。すべて送ったあとの線だけが残った空の送信待ちは、線も読み戻さない", () => {
  const { box, rows } = filled(["1 つ目", "2 つ目", "3 つ目"]);
  const moved = setStopAfter(moveOne(box, rows[1].id, 0)!, rows[0].id, true)!;
  assert.deepEqual(restoreOutbox(moved), moved);
  assert.deepEqual(view(restoreOutbox(moved)), "2 つ目 1 つ目 | 3 つ目");
  assert.equal(restoreOutbox(setPaused(moved, true)).paused, true);
  // 作業の途中でアプリを終えた: 空の列の線は読み戻さない（預かりはそのまま）
  const held = newMessage(envOf(), "いま", {}, []);
  assert.deepEqual(restoreOutbox({ now: [held], later: [], stops: [0], paused: true }), { now: [held], later: [], stops: [], paused: false });
});

test("出す箱: 線は、動かした・すべて送ったあとも位置で残り、作業のあいだに次の指示が来ればその前で待つ（止めておくには切り替えない）", () => {
  let { box, rows } = filled(["a", "b", "c"]);
  const [, b, c] = rows;
  // a | b c の c をいちばん上へ（線を越える → c a | b）
  box = moveOne(setStops(box, [1]), c.id, 0)!;
  assert.deepEqual(box.stops, [2]);
  // ドラッグで b を線のすぐ上へ落とす（c a b |）
  box = moveMany(box, [b.id], { before: b.id, belowStop: false });
  assert.deepEqual(box.stops, [3]);
  // すべて送ったあとの線は、列が空のまま残す
  for (let i = 0; i < 3; i++) box = takeLater(box)!.box;
  assert.deepEqual([box.later, box.stops], [[], [0]]);
  box = addLater(box, newMessage(envOf(), "d", {}, []));
  assert.equal(takeNext(box).item, null);
  assert.equal(box.paused, false);
  assert.deepEqual(restoreOutbox(box).stops, [0]);
  // すべて消したら線も外れる
  assert.deepEqual(clearLater(box), EMPTY_OUTBOX);
});

test("出す箱: すべて送ったあとの線は、次の指示が来ないまま作業が終わったら外す（あとで自分で送った作業の送信待ちで止めない）", () => {
  let { box, rows, env } = filled(["a"]);
  box = takeLater(setStopAfter(box, rows[0].id, true)!)!.box;
  assert.deepEqual(box.stops, [0]);
  const next = takeNext(box);
  assert.equal(next.item, null);
  assert.deepEqual(next.box.stops, []);
  // 次の作業のあいだに来た指示は、いつもどおり自動で送る
  assert.equal(takeNext(addLater(next.box, newMessage(env, "b", {}, []))).item?.text, "b");
  // 変えるものがなければ同じ箱
  assert.equal(takeNext(EMPTY_OUTBOX).box, EMPTY_OUTBOX);
});

test("出す箱: 線は指示とは別の位置で持ち、線をまたがない並べ替えでは動かない。先頭の上の線で待ち、その線を消すと次の線まで送る", () => {
  let { box, rows } = filled(["a", "b", "c"]);
  const [a, b, c] = rows;
  box = setStops(box, [2, 0]);
  assert.deepEqual(box.stops, [0, 2]);
  // 線をまたがない並べ替え（| a b | c の b をいちばん上へ）では動かない
  box = moveOne(box, b.id, 0)!;
  assert.deepEqual(box.stops, [0, 2]);
  // 先頭の上に線があるので、自動では送らずにその線で待つ
  assert.equal(takeNext(box).item, null);
  assert.equal(takeNext(box).box, box);
  // 先頭の上の線を消すと、次の線まで送る
  box = setStops(box, [2]);
  let next = takeNext(box);
  assert.equal(next.item?.id, b.id);
  next = takeNext(next.box);
  assert.equal(next.item?.id, a.id);
  box = next.box;
  assert.deepEqual(box.stops, [0]);
  assert.equal(takeNext(box).item, null);
  // 止めておいてから自動に戻したときも、先頭の上の線を越える
  box = setPaused(setPaused(box, true), false);
  assert.deepEqual(box.stops, []);
  box = setStops(box, [0]);
  // 右クリックの「この指示のあとで止める」: その指示のすぐあと（もう線があれば増やさない = 同じ箱）
  box = setStopAfter(box, c.id, true)!;
  assert.deepEqual(box.stops, [0, 1]);
  assert.equal(setStopAfter(box, c.id, true), box);
  assert.deepEqual(setStopAfter(box, c.id, false)!.stops, [0]);
  assert.equal(setStopAfter(box, "nope", true), null);
  // 止めておくのが変わらなければ同じ箱（列が空なら止めない）
  assert.equal(setPaused(box, false), box);
  assert.equal(setPaused(EMPTY_OUTBOX, true), EMPTY_OUTBOX);
});

test("出す箱: 指示を動かすと、動かした指示だけが線を越え、ほかの指示は線の同じ側に残る", () => {
  const reset = () => {
    const { box, rows } = filled(["a", "b", "c", "d"]);
    return { box: setStops(box, [2]), ids: rows.map((m) => m.id) };
  };
  // いちばん上へ: 線の下の d が線の上へ。b は線の上のまま
  let { box, ids } = reset();
  assert.equal(view(moveOne(box, ids[3], 0)!), "d a b | c");
  // いちばん下へ: 線の上の a が線の下へ。c は線の下のまま
  assert.equal(view(moveOne(box, ids[0], 3)!), "b | c d a");
  // 1 つ上・下へ: すぐ隣が線なら、並びは変えずに線だけを越える。隣が指示なら入れ替える
  box = moveOne(box, ids[2], 1)!;
  assert.equal(view(box), "a b c | d");
  box = moveOne(box, ids[2], 3)!;
  assert.equal(view(box), "a b | c d");
  assert.equal(view(moveOne(box, ids[3], 2)!), "a b | d c");
  assert.equal(moveOne(box, ids[0], 0), box);
  // まとめて動かす: いちばん上・いちばん下（1 件目の上・いちばん下の線は端に残る）
  ({ box, ids } = reset());
  box = moveMany(box, [ids[2], ids[3]], "top");
  assert.equal(view(box), "c d a b |");
  assert.equal(view(moveMany(setStops(box, [0, 2]), [ids[0]], "top")), "| a c d | b");
  assert.equal(moveMany(box, ["nope"], "top"), box);
  // ドラッグで落とした位置: 線のある位置なら、線の上（belowStop: false）か下か
  ({ box, ids } = reset());
  box = moveMany(box, [ids[3]], { before: ids[2], belowStop: false });
  assert.equal(view(box), "a b d | c");
  assert.equal(view(moveMany(box, [ids[0]], { before: ids[2], belowStop: true })), "b d | a c");
});

test("出す箱: 圧縮の行は、いちばん下・指示のすぐあと（線の上）に足せ、まとめるときは残る。予約はいちばん上に 1 つだけ入れ、止めていれば 1 件目の上の線に置き換える", () => {
  let { box, rows, env } = filled(["a", "b"]);
  box = addAction(setStopAfter(box, rows[0].id, true)!, "compact", rows[0].id, env)!;
  assert.equal(view(box), "a 圧縮 | b");
  assert.equal(addAction(box, "compact", "nope", env), null);
  box = addAction(box, "compact", null, env)!;
  assert.equal(view(box), "a 圧縮 | b 圧縮");
  // まとめても圧縮の行は残る（まとめた指示は 1 件目の位置）
  box = mergeLater(box, box.later.map((m) => m.id))!.box;
  assert.deepEqual(box.later.map((m) => (m.compact ? "圧縮" : m.text)), ["a\n\nb", "圧縮", "圧縮"]);

  // 予約: いちばん上に入れ、2 回頼んでも 1 つ
  box = addLater(clearLater(box), newMessage(env, "c", {}, []));
  box = reserve(box, "compact", env);
  const reserved = box.later[0];
  assert.equal(reserve(box, "compact", env), box);
  assert.equal(view(box), "圧縮 c");
  // 止めてから頼み直すと、止めるのは 1 件目の上の線（圧縮の行の下）に置き換わる
  box = reserve(setPaused(box, true), "compact", env);
  assert.equal(box.later[0].id, reserved.id);
  assert.equal(box.paused, false);
  assert.deepEqual(box.stops, [1]);
  const next = takeNext(box);
  assert.equal(next.item?.id, reserved.id);
  assert.equal(takeNext(next.box).item, null);
  assert.deepEqual(next.box.stops, [0]);
});

test("出す箱: 線は同じ位置に何本でも重ねられ、1 本ずつ越える", () => {
  let { box, rows } = filled(["a", "b"]);
  const [a, b] = rows;
  box = setStops(setStops(box, [...box.stops, 0]), [0, 0]);
  assert.deepEqual(restoreOutbox(box).stops, [0, 0]);
  // 指示をいちばん上へ移すと、2 本とも線の下に残る（動かした指示だけが線を越える）
  box = moveMany(box, [b.id], { before: a.id, belowStop: false });
  assert.deepEqual([box.later.map((m) => m.text), box.stops], [["b", "a"], [1, 1]]);
  box = moveMany(box, [b.id], "bottom");
  assert.deepEqual([box.later.map((m) => m.text), box.stops], [["a", "b"], [0, 0]]);
  // 先頭の上の線で待ち、自動で送るに戻すと 1 本だけ越える（残りの 1 本でまた待つ）
  box = setPaused(setPaused(box, true), false);
  assert.deepEqual(box.stops, [0]);
  // 「この指示のあとで止める」は、もう線があれば増やさない
  box = setStopAfter(setStopAfter(box, a.id, true)!, a.id, true)!;
  assert.deepEqual(box.stops, [0, 1]);
  // 指示を送ると、重なった線も本数のまま上に寄る
  const next = takeNext(setStops(box, [1, 1]));
  assert.equal(next.item?.text, "a");
  assert.deepEqual(next.box.stops, [0, 0]);
});

test("出す箱: 作業場所を移したあとの続きは、予約した圧縮・消去のあと・預かりの前に置き、止めていれば送信待ちの頭に入れる", () => {
  const env = envOf();
  const cont = newMessage(env, "続き", {}, [], { workplace_continuation: true });
  const held = newMessage(env, "いま", {}, []);
  const base: Outbox = { ...reserve(addLater(EMPTY_OUTBOX, newMessage(env, "次", {}, [])), "clear", env), now: [held] };
  // 予約した消去のあと（線の上）
  assert.deepEqual(placeContinuation(base, cont, false).box.later.map((m) => m.text || "消去"), ["消去", "続き", "次"]);
  // 予約がなければ預かりの前
  const plain = { ...EMPTY_OUTBOX, now: [held] };
  assert.deepEqual(placeContinuation(plain, cont, false), { box: { ...plain, now: [cont, held] }, stopped: false });
  // 止めていれば送信待ちの頭（片付けを先にしたときは、止めていても預かりの前）
  const paused = setPaused(addLater(plain, newMessage(env, "次", {}, [])), true);
  const placed = placeContinuation(paused, cont, false);
  assert.equal(placed.stopped, true);
  assert.deepEqual(placed.box.later.map((m) => m.text), ["続き", "次"]);
  assert.deepEqual(placeContinuation(paused, cont, true).box.now, [cont, held]);
});
