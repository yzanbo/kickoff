import assert from "node:assert/strict";
import { test } from "vitest";
import { createNavigationHistory } from "./navigationHistory";
import type { Route } from "./router";

const all: Route = { name: "allProjects" };
const board: Route = { name: "project", id: 1, tab: "board" };
const chat: Route = { name: "chat", projectId: 1, chatId: 10 };
const memos: Route = { name: "project", id: 1, tab: "memos" };

test("画面の履歴: 起動時はどちらにも移れず、端を越えても状態を変えない", () => {
  const history = createNavigationHistory(all);
  const initial = history.getSnapshot();
  assert.deepEqual(initial, { entries: [all], index: 0 });
  assert.equal(history.move(-1), undefined);
  assert.equal(history.move(1), undefined);
  assert.equal(history.getSnapshot(), initial);
});

test("画面の履歴: チャットだけでなく、タブ・プロジェクト・全プロジェクトを前後にたどる", () => {
  const history = createNavigationHistory(all);
  const other: Route = { name: "project", id: 2, tab: "files" };
  for (const route of [board, chat, memos, other]) history.record(route);
  for (const route of [memos, chat, board, all]) assert.deepEqual(history.move(-1), route);
  assert.equal(history.move(-1), undefined);
  for (const route of [board, chat, memos, other]) assert.deepEqual(history.move(1), route);
  assert.equal(history.move(1), undefined);
});

test("画面の履歴: 戻った先から新しい画面を開いたら、進む履歴だけを捨てる", () => {
  const history = createNavigationHistory(all);
  history.record(board);
  history.record(chat);
  history.move(-1);
  history.record(memos);
  assert.deepEqual(history.getSnapshot(), { entries: [all, board, memos], index: 2 });
  assert.equal(history.move(1), undefined);
  assert.deepEqual(history.move(-1), board);
});

test("画面の履歴: 同じ画面・一度きりの指定を重ねて積まず、進む履歴も消さない", () => {
  const history = createNavigationHistory(board);
  history.record(chat);
  history.record(memos);
  history.move(-1);
  const before = history.getSnapshot();
  history.record({ ...chat, focus: 123 } as Route);
  assert.equal(history.getSnapshot(), before);
  assert.deepEqual(history.move(1), memos);
  history.record({ name: "project", id: 1, tab: "memos", memo: "設計.md", memoLine: 12 });
  assert.equal(history.getSnapshot().entries.length, 3);
  const files: Route = { name: "project", id: 1, tab: "files" };
  history.record({ ...files, file: { path: "README.md", line: 4 } } as Route);
  history.record(files, true);
  assert.deepEqual(history.getSnapshot().entries.at(-1), files);
  assert.equal(history.getSnapshot().entries.length, 4);
});

test("画面の履歴: 新規作成後の URL の置き換えは履歴を増やさず、作成前の画面へ戻る", () => {
  const history = createNavigationHistory(board);
  history.record({ name: "newChat", projectId: 1 });
  history.record(chat, true);
  assert.deepEqual(history.getSnapshot(), { entries: [board, chat], index: 1 });
  assert.deepEqual(history.move(-1), board);
  // 履歴をたどるときも URL を置き換えるが、進む先は失わない
  history.record(board, true);
  assert.deepEqual(history.move(1), chat);
});

test("画面の履歴: プロジェクトが異なるチャットは別の画面として扱う", () => {
  const history = createNavigationHistory(chat);
  history.record({ name: "chat", projectId: 2, chatId: 10 });
  assert.equal(history.getSnapshot().entries.length, 2);
  assert.deepEqual(history.move(-1), chat);
});

test("画面の履歴: 最近の 50 画面だけを覚え、古い画面を落としても現在位置を保つ", () => {
  const history = createNavigationHistory(all);
  for (let id = 1; id <= 60; id++) history.record({ name: "project", id, tab: "board" });
  const { entries, index } = history.getSnapshot();
  assert.equal(entries.length, 50);
  assert.equal(index, 49);
  assert.deepEqual(entries[0], { name: "project", id: 11, tab: "board" });
  assert.deepEqual(entries[49], { name: "project", id: 60, tab: "board" });
  for (let i = 0; i < 49; i++) history.move(-1);
  assert.equal(history.move(-1), undefined);
});

test("画面の履歴: 変更時だけ購読者に知らせ、購読を解除できる", () => {
  const history = createNavigationHistory(all);
  let calls = 0;
  const unsubscribe = history.subscribe(() => calls++);
  history.record(all);
  history.move(-1);
  assert.equal(calls, 0);
  history.record(board);
  history.move(-1);
  history.move(1);
  assert.equal(calls, 3);
  unsubscribe();
  history.record(chat);
  assert.equal(calls, 3);
});
