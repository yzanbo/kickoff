import assert from "node:assert/strict";
import { test } from "vitest";
import { installMemoryStorage } from "./memoryStorage";
import { assertGroups, defineSettings, family, forgetIdSettings, pruneUndeclared, single, type StorageGroup } from "./groups";
import { choice, defineSetting, defineSettingFamily, flag, number, readSetting, record, subscribeSetting, writeSetting } from "./settings";

const { local, session } = installMemoryStorage();

const isString = (v: unknown): v is string => typeof v === "string";

// このファイルだけの群（純粋なので、片付けに渡した群だけが宣言済みになる）
const board = defineSettings("tBoard", {
  view: choice(["board", "list"], "board"),
  listWidth: number(300),
  current: single(number(0), { ids: true }),
  lastHashes: single(record(isString), { ids: true, session: true }),
  groupClosed: family(flag(), { ids: true }),
  laneMode: family(choice(["none", "group"], "none")),
});
const other = defineSettings("tOther", { compact: flag() });
const GROUPS: readonly StorageGroup[] = [board, other];

test("defineSettings: キーは kickoff:<namespace>:<名前の kebab>、ID ごとはその後ろに \":\" ＋ ID。形・選択肢・ids・session を保つ", () => {
  const s = board.settings;
  assert.equal(board.namespace, "tBoard");
  assert.equal(s.view.key, "kickoff:tBoard:view");
  assert.deepEqual(s.view.choices, ["board", "list"]);
  assert.equal(s.listWidth.key, "kickoff:tBoard:list-width");
  assert.equal(s.listWidth.initial, 300);
  assert.equal(s.current.ids, true);
  assert.equal(s.current.area, "local");
  assert.equal(s.lastHashes.area, "session");
  assert.equal(s.groupClosed.prefix, "kickoff:tBoard:group-closed:");
  assert.equal(s.groupClosed(5).key, "kickoff:tBoard:group-closed:5");
  assert.equal(s.groupClosed(5).ids, true);
  assert.deepEqual(s.laneMode.shape.choices, ["none", "group"]);
  assert.equal(s.laneMode("x").ids, false);
  writeSetting(s.listWidth, 420);
  assert.equal(local.getItem("kickoff:tBoard:list-width"), "420");
  assert.throws(() => defineSettings("t:bad", { x: flag() }));
});

test("assertGroups: 同じ namespace を 2 回・同じキーを 2 回・ほかの ID ごとの頭と重なるキーは投げる（別の保存先の同じキーはよい）", () => {
  assert.doesNotThrow(() => assertGroups(GROUPS));
  assert.throws(() => assertGroups([board, defineSettings("tBoard", { other: flag() })]), /namespace/);
  const raw = (namespace: string, settings: StorageGroup["settings"]): StorageGroup => ({ namespace, settings });
  assert.throws(() => assertGroups([board, raw("a", { x: defineSetting("kickoff:tBoard:view", flag()) })]));
  assert.throws(() => assertGroups([board, raw("a", { x: defineSetting("kickoff:tBoard:group-closed:9", flag()) })]));
  // ほかのキーを含んでしまう頭は投げ、ほかの頭の手前までの名前のキーはよい
  assert.throws(() => assertGroups([board, raw("a", { x: defineSettingFamily("kickoff:tBoard:", flag()) })]));
  assert.doesNotThrow(() => assertGroups([raw("a", { x: defineSetting("kickoff:tBoard:group", flag()) }), board]));
  assert.doesNotThrow(() => assertGroups([board, raw("a", { x: defineSetting("kickoff:tBoard:view", flag(), { session: true }) })]));
});

test("片付け: 群に宣言していない kickoff: のキーを消す（宣言したもの・ほかのアプリのキーは残す。保存先も宣言と合わなければ消す）", () => {
  local.setItem("kickoff:tBoard:view", "list");
  local.setItem("kickoff:tBoard:group-closed:3", "1");
  local.setItem("kickoff:sidebar-grouping", "status");
  local.setItem("kickoff:tBoard:last-hashes", "{}");
  local.setItem("other-app:theme", "dark");
  session.setItem("kickoff:tBoard:last-hashes", '{"1":"#/"}');
  session.setItem("kickoff:old", "x");
  assert.deepEqual(pruneUndeclared(GROUPS).sort(), ["kickoff:old", "kickoff:sidebar-grouping", "kickoff:tBoard:last-hashes"]);
  assert.equal(local.getItem("kickoff:tBoard:view"), "list");
  assert.equal(local.getItem("kickoff:tBoard:group-closed:3"), "1");
  assert.equal(local.getItem("other-app:theme"), "dark");
  assert.equal(session.getItem("kickoff:tBoard:last-hashes"), '{"1":"#/"}');
});

test("片付け: 群に入っていない宣言のキーは、宣言していても消える（渡した群だけが宣言済み）", () => {
  writeSetting(other.settings.compact, true);
  writeSetting(board.settings.view, "list");
  assert.deepEqual(pruneUndeclared([board]), ["kickoff:tOther:compact"]);
  assert.equal(readSetting(other.settings.compact), false);
  assert.equal(readSetting(board.settings.view), "list");
});

test("片付け: ID を含む設定（ids を付けたもの）だけを、どちらの保存先からも消し、読み直すと初めの値", () => {
  const s = board.settings;
  writeSetting(s.current, 12);
  writeSetting(s.groupClosed(4), true);
  writeSetting(s.lastHashes, { 12: "#/projects/12" });
  writeSetting(s.laneMode("p1"), "group");
  writeSetting(other.settings.compact, true);
  let notified = 0;
  const stop = subscribeSetting(s.current, () => notified++);
  assert.deepEqual(forgetIdSettings(GROUPS).sort(), ["kickoff:tBoard:current", "kickoff:tBoard:group-closed:4", "kickoff:tBoard:last-hashes"]);
  assert.equal(readSetting(s.current), 0);
  assert.equal(readSetting(s.groupClosed(4)), false);
  assert.deepEqual(readSetting(s.lastHashes), {});
  assert.equal(readSetting(s.laneMode("p1")), "group");
  assert.equal(readSetting(other.settings.compact), true);
  assert.equal(notified, 1);
  stop();
});
