import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { installMemoryStorage } from "./memoryStorage";
import {
  choice,
  defineSetting,
  defineSettingFamily,
  familyVersion,
  flag,
  forgetIdSettings,
  list,
  number,
  pruneUndeclared,
  readSetting,
  record,
  storedIds,
  subscribeFamily,
  subscribeSetting,
  text,
  writeSetting,
} from "./storage";

const { local, session } = installMemoryStorage();
beforeEach(() => {
  local.clear();
  session.clear();
});

// このファイルだけの宣言（宣言は起動のたびに 1 回。テストごとに作り直さない）
const OPEN = defineSetting("kickoff:t-open", flag(true, ["open", "closed"]));
const COMPACT = defineSetting("kickoff:t-compact", flag());
const MODE = defineSetting("kickoff:t-mode", choice(["queue", "tell"], "tell"));
const WIDTH = defineSetting("kickoff:t-width", number(300));
const DRAFT = defineSetting("kickoff:t-draft", text());
const TAGS = defineSetting("kickoff:t-tags", list());
const HASHES = defineSetting("kickoff:t-hashes", record((v): v is string => typeof v === "string"), { session: true, ids: true });
const CURRENT = defineSetting("kickoff:t-current", number(0), { ids: true });
const groupClosed = defineSettingFamily("kickoff:t-group-closed:", flag(), { ids: true });
const surfaceMode = defineSettingFamily("kickoff:t-surface:", choice(["none", "group"], "none"));

test("値の形: 未保存・読めない値は初めの値。保存する文字はキー名と同じく、今までの形のまま（\"1\" / \"0\"、\"open\" / \"closed\" など）", () => {
  assert.equal(readSetting(OPEN), true);
  writeSetting(OPEN, false);
  assert.equal(local.getItem("kickoff:t-open"), "closed");
  assert.equal(readSetting(OPEN), false);
  writeSetting(COMPACT, true);
  assert.equal(local.getItem("kickoff:t-compact"), "1");
  // 知らない値は初めの値
  local.setItem("kickoff:t-mode", "interrupt");
  assert.equal(readSetting(MODE), "tell");
  assert.deepEqual(MODE.choices, ["queue", "tell"]);
  // 数は 0・数でない値なら初めの値
  local.setItem("kickoff:t-width", "abc");
  assert.equal(readSetting(WIDTH), 300);
  local.setItem("kickoff:t-width", "0");
  assert.equal(readSetting(WIDTH), 300);
  writeSetting(WIDTH, 420);
  assert.equal(local.getItem("kickoff:t-width"), "420");
});

test("値の形: 文字は空にしたらキーごと消し、配列・オブジェクトは壊れた値・形の違う値を捨てる（空のオブジェクトはキーごと消す）", () => {
  writeSetting(DRAFT, "書きかけ");
  assert.equal(local.getItem("kickoff:t-draft"), "書きかけ");
  writeSetting(DRAFT, "");
  assert.equal(local.getItem("kickoff:t-draft"), null);
  local.setItem("kickoff:t-tags", "{oops");
  assert.deepEqual(readSetting(TAGS), []);
  local.setItem("kickoff:t-tags", JSON.stringify(["仕事", 3, "", null]));
  assert.deepEqual(readSetting(TAGS), ["仕事", ""]);
  session.setItem("kickoff:t-hashes", JSON.stringify({ 1: "#/projects/1", 2: 3, x: "#/" }));
  assert.deepEqual(readSetting(HASHES), { 1: "#/projects/1", x: "#/" });
  for (const broken of ["[1,2]", "null", '"#/"', "{"]) {
    session.setItem("kickoff:t-hashes", broken);
    assert.deepEqual(readSetting(HASHES), {});
  }
  writeSetting(HASHES, { 3: "#/projects/3" });
  assert.equal(session.getItem("kickoff:t-hashes"), '{"3":"#/projects/3"}');
  writeSetting(HASHES, {});
  assert.equal(session.getItem("kickoff:t-hashes"), null);
});

test("読み書き: 保存した文字が同じなら同じ値（配列の参照が変わらない）。外で書き換えたら、次に読んだときに読み直す", () => {
  writeSetting(TAGS, ["a"]);
  const first = readSetting(TAGS);
  assert.equal(readSetting(TAGS), first);
  local.setItem("kickoff:t-tags", JSON.stringify(["b"]));
  assert.deepEqual(readSetting(TAGS), ["b"]);
});

test("知らせ: 書いたら、その設定を見ているものすべてに知らせる。中身が変わらなければ知らせない", () => {
  const calls: string[] = [];
  const stopA = subscribeSetting(COMPACT, () => calls.push("a"));
  const stopB = subscribeSetting(COMPACT, () => calls.push("b"));
  const stopOther = subscribeSetting(WIDTH, () => calls.push("width"));
  writeSetting(COMPACT, true);
  assert.deepEqual(calls, ["a", "b"]);
  writeSetting(COMPACT, true);
  assert.deepEqual(calls, ["a", "b"]);
  stopA();
  writeSetting(COMPACT, false);
  assert.deepEqual(calls, ["a", "b", "b"]);
  stopB();
  stopOther();
});

test("ID ごとの設定: キーは頭 ＋ ID。同じ ID なら同じ設定で、どの ID を書いても仲間の購読に知らせる", () => {
  assert.equal(groupClosed(5).key, "kickoff:t-group-closed:5");
  assert.equal(groupClosed(5), groupClosed("5"));
  assert.deepEqual(surfaceMode.shape.choices, ["none", "group"]);
  let calls = 0;
  const stop = subscribeFamily(groupClosed, () => calls++);
  const before = familyVersion(groupClosed);
  writeSetting(groupClosed(5), true);
  writeSetting(groupClosed(6), true);
  assert.equal(calls, 2);
  assert.equal(familyVersion(groupClosed), before + 2);
  assert.equal(readSetting(groupClosed(5)), true);
  assert.equal(readSetting(groupClosed(7)), false);
  assert.deepEqual(storedIds(groupClosed).sort(), ["5", "6"]);
  stop();
});

test("宣言: kickoff: で始まらないキー・同じキー・ほかの宣言の頭に入るキーは宣言できない（どのキーがどの宣言のものか、1 通りに決まる）", () => {
  assert.throws(() => defineSetting("other:key", flag()));
  assert.throws(() => defineSetting("kickoff:t-open", flag()));
  assert.throws(() => defineSetting("kickoff:t-group-closed:9", flag()));
  assert.throws(() => defineSettingFamily("kickoff:t-group-closed:x:", flag()));
  // すべての kickoff: のキーを含んでしまう頭・":" で終わらない頭
  assert.throws(() => defineSettingFamily("kickoff:", flag()));
  assert.throws(() => defineSettingFamily("kickoff:t-no-colon", flag()));
  // ほかの頭の手前までの名前のキー・別の保存先（sessionStorage）の同じキーはよい
  assert.doesNotThrow(() => defineSetting("kickoff:t-group", flag()));
  assert.doesNotThrow(() => defineSetting("kickoff:t-open", flag(), { session: true }));
});

test("片付け: 宣言していない kickoff: のキーを消す（宣言したもの・ほかのアプリのキーは残す。保存先も宣言と合わなければ消す）", () => {
  local.setItem("kickoff:t-compact", "1");
  local.setItem("kickoff:t-group-closed:3", "1");
  local.setItem("kickoff:sidebar-grouping", "status");
  local.setItem("kickoff:t-hashes", "{}");
  local.setItem("other-app:theme", "dark");
  session.setItem("kickoff:t-hashes", '{"1":"#/"}');
  session.setItem("kickoff:old", "x");
  assert.deepEqual(pruneUndeclared().sort(), ["kickoff:old", "kickoff:sidebar-grouping", "kickoff:t-hashes"]);
  assert.equal(local.getItem("kickoff:t-compact"), "1");
  assert.equal(local.getItem("kickoff:t-group-closed:3"), "1");
  assert.equal(local.getItem("other-app:theme"), "dark");
  assert.equal(session.getItem("kickoff:t-hashes"), '{"1":"#/"}');
  assert.equal(local.getItem("kickoff:t-hashes"), null);
});

test("片付け: ID を含む設定（ids を付けて宣言したもの）だけを、どちらの保存先からも消し、読み直すと初めの値", () => {
  writeSetting(CURRENT, 12);
  writeSetting(groupClosed(4), true);
  writeSetting(HASHES, { 12: "#/projects/12" });
  writeSetting(COMPACT, true);
  let notified = 0;
  const stop = subscribeSetting(CURRENT, () => notified++);
  assert.deepEqual(forgetIdSettings().sort(), ["kickoff:t-current", "kickoff:t-group-closed:4", "kickoff:t-hashes"]);
  assert.equal(readSetting(CURRENT), 0);
  assert.equal(readSetting(groupClosed(4)), false);
  assert.deepEqual(readSetting(HASHES), {});
  assert.equal(readSetting(COMPACT), true);
  assert.equal(notified, 1);
  stop();
});
