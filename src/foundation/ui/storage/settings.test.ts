import assert from "node:assert/strict";
import { test } from "vitest";
import { installMemoryStorage } from "@/foundation/ui/testing/memoryStorage";
import {
  choice,
  defineSetting,
  defineSettingFamily,
  familyVersion,
  flag,
  list,
  number,
  optionalFlag,
  readSetting,
  record,
  storedIds,
  subscribeFamily,
  subscribeSetting,
  text,
  writeSetting,
} from "./settings";

const { local, session } = installMemoryStorage();

// このファイルだけの宣言（純粋なので、どこにも登録されない）
const OPEN = defineSetting("kickoff:t-open", flag(true));
const COMPACT = defineSetting("kickoff:t-compact", flag());
const MODE = defineSetting("kickoff:t-mode", choice(["queue", "tell"], "tell"));
const WIDTH = defineSetting("kickoff:t-width", number(300));
const DRAFT = defineSetting("kickoff:t-draft", text());
const TAGS = defineSetting("kickoff:t-tags", list());
const HASHES = defineSetting("kickoff:t-hashes", record((v): v is string => typeof v === "string"), { session: true, ids: true });
const groupClosed = defineSettingFamily("kickoff:t-group-closed:", flag(), { ids: true });
const surfaceMode = defineSettingFamily("kickoff:t-surface:", choice(["none", "group"], "none"));
const folds = defineSettingFamily("kickoff:t-fold:", optionalFlag());

test("値の形: optionalFlag は \"1\" / \"0\" と、まだ決めていない（undefined。書くとキーごと消す）", () => {
  assert.equal(readSetting(folds("a")), undefined);
  writeSetting(folds("a"), false);
  assert.equal(local.getItem("kickoff:t-fold:a"), "0");
  assert.equal(readSetting(folds("a")), false);
  writeSetting(folds("a"), true);
  assert.equal(local.getItem("kickoff:t-fold:a"), "1");
  local.setItem("kickoff:t-fold:b", "open");
  assert.equal(readSetting(folds("b")), undefined);
  writeSetting(folds("a"), undefined);
  assert.equal(local.getItem("kickoff:t-fold:a"), null);
});

test("値の形: 未保存・読めない値は初めの値。オン・オフは \"1\" / \"0\" で保存する", () => {
  assert.equal(readSetting(OPEN), true);
  writeSetting(OPEN, false);
  assert.equal(local.getItem("kickoff:t-open"), "0");
  assert.equal(readSetting(OPEN), false);
  local.setItem("kickoff:t-open", "closed");
  assert.equal(readSetting(OPEN), true);
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

test("宣言: キーは kickoff: で始め、ID ごとの頭は \":\" で終える（重なりは群を渡す片付けが確かめる = groups.test.ts）", () => {
  assert.throws(() => defineSetting("other:key", flag()));
  assert.throws(() => defineSettingFamily("other:", flag()));
  assert.throws(() => defineSettingFamily("kickoff:t-no-colon", flag()));
  // 同じキーをもう一度作っても投げない（作るだけで登録しない）
  assert.equal(defineSetting("kickoff:t-open", flag()).key, OPEN.key);
});
