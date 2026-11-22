import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";
import type { GitStatus } from "@shared/git/types";
import { createAutoFetcher } from "./gitAutoFetch";
import { createGitStatusStore } from "./gitStatusStore";

const main = { projectId: 1, worktree: null };
const tree = { projectId: 1, worktree: "/w/a" };

/** 読んだ作業場所とフェッチを数える店（読むたびに状態は git でない形を返す） */
function setup() {
  vi.useFakeTimers();
  onTestFinished(() => void vi.useRealTimers());
  const loads: string[] = [];
  const fetches: string[] = [];
  const store = createGitStatusStore({
    load: async (ref) => {
      loads.push(ref.worktree ?? "main");
      return { repo: false } satisfies GitStatus;
    },
    fetch: async (ref) => void fetches.push(ref.worktree ?? "main"),
    autoFetcher: createAutoFetcher({ minInterval: 0 }),
  });
  return { store, loads, fetches };
}

test("Git の状態の店: 同じ作業場所を何か所で読んでも取りに行くのは 1 回で、作業場所ごとに別に持つ", async () => {
  const { store, loads } = setup();
  const offs = [store.watch(main), store.watch(main), store.watch(tree)];
  await vi.advanceTimersByTimeAsync(0);
  assert.deepEqual(loads, ["main", "/w/a"]);
  assert.equal(store.state("1:").data?.value.repo, false);
  // あとから読み始めた所は、届いている値をそのまま使う
  offs.push(store.watch(main));
  await vi.advanceTimersByTimeAsync(0);
  assert.deepEqual(loads, ["main", "/w/a"]);
  // 誰も読まなくなったら捨て、次に読むときに取り直す
  offs.forEach((off) => off());
  await vi.advanceTimersByTimeAsync(0);
  assert.equal(store.state("1:").data, undefined);
  store.watch(main);
  await vi.advanceTimersByTimeAsync(0);
  assert.deepEqual(loads, ["main", "/w/a", "main"]);
});

test("Git の状態の店: active の部品がいくつあっても 5 秒ごとの取り直しと自動のフェッチは 1 つで、更新中の印は立てない", async () => {
  const { store, loads, fetches } = setup();
  store.watch(main);
  const offs = [store.activate(main), store.activate(main)];
  await vi.advanceTimersByTimeAsync(0);
  assert.deepEqual(fetches, ["main"]);
  const before = loads.length;
  let flagged = false;
  store.subscribe("1:", () => (flagged ||= store.flags("1:").refreshing));
  await vi.advanceTimersByTimeAsync(5000);
  assert.equal(loads.length, before + 1);
  assert.equal(flagged, false);
  // active でなくなったら止める
  offs.forEach((off) => off());
  await vi.advanceTimersByTimeAsync(10_000);
  assert.equal(loads.length, before + 1);
});

test("Git の状態の店: チャットが動いたら更新中の印を出し、続く知らせは最初から 1.5 秒の 1 回にまとめる", async () => {
  const { store, loads } = setup();
  store.watch(main);
  store.watch({ projectId: 2, worktree: null });
  await vi.advanceTimersByTimeAsync(0);
  loads.length = 0;
  store.chatMoved(1);
  assert.equal(store.flags("1:").refreshing, true);
  assert.equal(store.flags("2:").refreshing, false);
  await vi.advanceTimersByTimeAsync(1000);
  store.chatMoved(1);
  await vi.advanceTimersByTimeAsync(500);
  assert.deepEqual(loads, ["main"]);
  assert.equal(store.flags("1:").refreshing, false);
});

test("Git の状態の店: 操作の応答は取り直しを待たずにそのまま出す", async () => {
  const { store } = setup();
  store.watch(main);
  const applied = { repo: true } as GitStatus;
  await store.apply(main, Promise.resolve(applied));
  await vi.advanceTimersByTimeAsync(0);
  assert.equal(store.state("1:").data?.value, applied);
  assert.equal(store.state("1:").loading, false);
});
