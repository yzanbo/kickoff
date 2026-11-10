import assert from "node:assert/strict";
import { test } from "node:test";
import { insertDictation, joinTranscripts, micErrorMessage, transcribeParts } from "./dictationText";

test("起こした文を入れる: 空の入力欄・キャレットの位置・選んだ範囲の置き換え", () => {
  assert.deepEqual(insertDictation("", 0, 0, " こんにちは "), { text: "こんにちは", caret: 5 });
  assert.deepEqual(insertDictation("前の文。", 4, 4, "次の文。"), { text: "前の文。次の文。", caret: 8 });
  assert.deepEqual(insertDictation("ここを置き換え", 3, 7, "これに"), { text: "ここをこれに", caret: 6 });
});

test("起こした文を入れる: 英字とくっつくときだけ空白を補い、空白・改行の隣や日本語どうしには入れない", () => {
  assert.equal(insertDictation("fix the", 7, 7, "README").text, "fix the README");
  assert.equal(insertDictation("Kickoff", 7, 7, "を直して").text, "Kickoff を直して");
  assert.equal(insertDictation("一行目\n", 4, 4, "二行目").text, "一行目\n二行目");
  assert.equal(insertDictation("ab", 1, 1, "x").text, "a x b");
  assert.equal(insertDictation("が", 0, 0, "これ").text, "これが");
});

test("起こした文が空なら、入力欄は変えない", () => {
  assert.deepEqual(insertDictation("そのまま", 2, 2, "  "), { text: "そのまま", caret: 2 });
});

test("マイクの失敗の文: 許可がない・見つからない・使えない", () => {
  assert.match(micErrorMessage({ name: "NotAllowedError" }), /システム設定 → プライバシーとセキュリティ → マイク/);
  assert.match(micErrorMessage({ name: "NotFoundError" }), /マイクが見つかりません/);
  assert.match(micErrorMessage(new Error("boom")), /録音を始められません: boom/);
});

test("区切って起こした文をつなぐ: 日本語どうしは詰め、英字の間には空白、空の区切りは飛ばす", () => {
  assert.equal(joinTranscripts(["今日は", "  ", "晴れです"]), "今日は晴れです");
  assert.equal(joinTranscripts(["Hello", "world"]), "Hello world");
  assert.equal(joinTranscripts([]), "");
});

test("長い録音の区切りを順に文字にしてつなぐ", async () => {
  const seen: number[] = [];
  const text = await transcribeParts([new Blob(["a"]), new Blob(["bb"])], async (b) => {
    seen.push(b.size);
    return b.size === 1 ? "前半" : "後半";
  });
  assert.deepEqual(seen, [1, 2]);
  assert.equal(text, "前半後半");
});
