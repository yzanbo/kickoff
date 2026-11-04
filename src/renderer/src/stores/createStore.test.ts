import assert from "node:assert/strict";
import { test } from "node:test";
import type { BusEvent, ChatGroup } from "@shared/types";
import { makeGroup } from "@shared/testing/factories";
import { publishServerEvent, publishServerOpen } from "@/api/events";
import { createStore } from "./createStore";
import { createKeyedStore } from "./keyedStore";

/** 外から終わらせられる読み込み */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 頼まれた読み込みを順に覚え、テストから 1 つずつ終わらせる */
function loader<T>() {
  const calls: ReturnType<typeof deferred<T>>[] = [];
  return {
    calls,
    load: () => {
      const d = deferred<T>();
      calls.push(d);
      return d.promise;
    },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const group = (id: number, project_id = 1) => makeGroup(id, { project_id, name: `g${id}` });
const groupEvent = (g: ChatGroup): BusEvent => ({ type: "group", group: g });

test("店: 同時に何度頼まれても読み込みは 1 回で、届いたら値を出す", async () => {
  const { calls, load } = loader<number>();
  const store = createStore({ load });
  assert.deepEqual(store.get(), { data: undefined, error: undefined, loading: false, loaded: false });
  const release = store.retain();
  store.ensure();
  store.retain()();
  assert.equal(calls.length, 1);
  assert.equal(store.get().loading, true);
  calls[0].resolve(3);
  await flush();
  assert.deepEqual(store.get(), { data: 3, error: undefined, loading: false, loaded: true });
  // 古くならない店は、もう一度使っても取り直さない
  store.ensure();
  assert.equal(calls.length, 1);
  release();
});

test("店: 失敗は覚えず（前の値は残す）、取り直すまでの間に使い始めても頼み直さない。reload ならすぐ取り直す", async () => {
  const { calls, load } = loader<number>();
  const store = createStore({ load });
  store.ensure();
  calls[0].resolve(1);
  await flush();
  store.invalidate();
  // 使っていなければ、古いことにするだけで取り直さない
  assert.equal(calls.length, 1);
  store.ensure();
  calls[1].reject(new Error("つながりません"));
  await flush();
  assert.deepEqual(store.get(), { data: 1, error: "つながりません", loading: false, loaded: true });
  store.ensure();
  assert.equal(calls.length, 2);
  void store.reload();
  assert.equal(calls.length, 3);
  calls[2].resolve(2);
  await flush();
  assert.deepEqual(store.get(), { data: 2, error: undefined, loading: false, loaded: true });
});

test("店: 使っている値の読み込みに失敗したら、間隔を伸ばしながら自動で取り直す（読めたら間隔を戻す）", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { calls, load } = loader<number>();
  const store = createStore({ load });
  const release = store.retain();
  calls[0].reject(new Error("失敗"));
  await flush();
  t.mock.timers.tick(1999);
  assert.equal(calls.length, 1);
  t.mock.timers.tick(1);
  assert.equal(calls.length, 2);
  calls[1].reject(new Error("失敗"));
  await flush();
  // 2 回続けて失敗したら 4 秒
  t.mock.timers.tick(2000);
  assert.equal(calls.length, 2);
  t.mock.timers.tick(2000);
  assert.equal(calls.length, 3);
  calls[2].resolve(1);
  await flush();
  release();
  // 使っていない間に失敗したものは、自動では取り直さない（次に使うときに）
  void store.reload();
  calls[3].reject(new Error("失敗"));
  await flush();
  t.mock.timers.tick(60_000);
  assert.equal(calls.length, 4);
  store.retain()();
  assert.equal(calls.length, 5);
});

test("店: 知らせで値を直し、読み込みの最中に届いた知らせは、届いた値にもう一度当てる", async () => {
  const { calls, load } = loader<ChatGroup[]>();
  const store = createKeyedStore<number, ChatGroup[]>({
    load,
    reduce: (list, e, projectId) => (e.type === "group" && e.group.project_id === projectId ? [...list.filter((g) => g.id !== e.group.id), e.group] : list),
  });
  store.ensure(1);
  // 読み込みの最中に作られたグループ（届く一覧には入っていない）
  publishServerEvent(groupEvent(group(2)));
  calls[0].resolve([group(1)]);
  await flush();
  assert.deepEqual(store.get(1).data?.map((g) => g.id), [1, 2]);
  // 読み込んだあとの知らせ。関係のない知らせでは、値は同じもののまま
  const before = store.get(1);
  publishServerEvent(groupEvent(group(3, 9)));
  assert.equal(store.get(1), before);
  publishServerEvent(groupEvent(group(3)));
  assert.deepEqual(store.get(1).data?.map((g) => g.id), [1, 2, 3]);
  // 読み込んでいない key には当てない
  assert.equal(store.get(9).loaded, false);
});

test("店: 取り直しの知らせは、使っていればすぐ、読み込み中なら終わってからもう一度、使っていなければ次に使うときに", async () => {
  const { calls, load } = loader<number>();
  const store = createStore({ load, reloadOn: (e) => e.type === "settings" });
  const settings = { type: "settings" } as BusEvent;
  const release = store.retain();
  publishServerEvent(settings);
  // 読み込み中: まだ頼まない
  assert.equal(calls.length, 1);
  calls[0].resolve(1);
  await flush();
  assert.equal(calls.length, 2);
  calls[1].resolve(2);
  await flush();
  publishServerEvent(settings);
  assert.equal(calls.length, 3);
  calls[2].resolve(3);
  await flush();
  release();
  publishServerEvent(settings);
  assert.equal(calls.length, 3);
  store.ensure();
  assert.equal(calls.length, 4);
});

test("店: set で入れた値は、読み込み中の依頼の結果より優先する。reload は届いた値を返す", async () => {
  const { calls, load } = loader<number>();
  const store = createStore({ load });
  const reloaded = store.reload();
  store.set(5);
  assert.equal(await reloaded, 5);
  calls[0].resolve(1);
  await flush();
  assert.equal(store.get().data, 5);
  // 読み込み中の reload は、終わってからもう一度読んだ値を返す
  const first = store.reload();
  const second = store.reload();
  calls[1].resolve(6);
  await flush();
  calls[2].resolve(7);
  assert.deepEqual(await Promise.all([first, second]), [7, 7]);
  // 失敗は待つ側に届く
  const failed = store.reload();
  calls[3].reject(new Error("失敗"));
  await assert.rejects(failed, /失敗/);
});

test("店: maxAge を過ぎてから使うと、前の値を出したまま取り直す（0 なら使い始めるたびに）", async () => {
  const { calls, load } = loader<number>();
  const store = createStore({ load, maxAge: 0 });
  store.retain()();
  calls[0].resolve(1);
  await flush();
  store.retain()();
  assert.equal(calls.length, 2);
  assert.deepEqual(store.get(), { data: 1, error: undefined, loading: true, loaded: true });
});

test("店: dropOn の知らせで、その key の値を捨てる", async () => {
  const { calls, load } = loader<number>();
  const store = createKeyedStore<number, number>({ load, dropOn: (e) => (e.type === "project_deleted" ? e.id : undefined) });
  store.ensure(1);
  store.ensure(2);
  calls[0].resolve(10);
  calls[1].resolve(20);
  await flush();
  let notified = 0;
  store.subscribe(1, () => notified++);
  publishServerEvent({ type: "project_deleted", id: 1 });
  assert.equal(store.get(1).loaded, false);
  assert.equal(store.get(2).data, 20);
  assert.equal(notified, 1);
});

test("店: つながったら、知らせで直している値は使っているものをすべて取り直す（つながる前に読んだ値は、その間の知らせを取りこぼしている）", async () => {
  const { calls, load } = loader<number>();
  const store = createKeyedStore<number, number>({ load, reduce: (n) => n });
  const releases = [store.retain(1), store.retain(2)];
  store.ensure(3);
  calls[0].reject(new Error("起動中"));
  calls[1].resolve(2);
  calls[2].resolve(3);
  await flush();
  publishServerOpen();
  // 使っている 1・2 だけ（使っていない 3 は、次に使うときに）
  assert.equal(calls.length, 5);
  store.ensure(3);
  assert.equal(calls.length, 6);
  releases.forEach((release) => release());
});

test("店: 知らせで直さない店は、つながったときに失敗した値だけを取り直す", async () => {
  const { calls, load } = loader<number>();
  const store = createKeyedStore<number, number>({ load, maxAge: 60_000 });
  const releases = [store.retain(1), store.retain(2)];
  calls[0].reject(new Error("起動中"));
  calls[1].resolve(2);
  await flush();
  publishServerOpen();
  assert.equal(calls.length, 3);
  releases.forEach((release) => release());
});
