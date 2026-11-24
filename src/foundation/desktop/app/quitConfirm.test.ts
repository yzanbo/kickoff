import assert from "node:assert/strict";
import { test } from "vitest";
import { quitConfirmText } from "./quitConfirm";

test("終了してよいかの文: 件数を見出しに、名前を 5 件まで並べ、残りは数だけ（名前のないチャットの既定の名前はコアが付ける）", () => {
  const one = quitConfirmText([{ title: "調べもの" }]);
  assert.equal(one.message, "作業中のチャットが 1 件あります");
  assert.equal(one.detail, "・調べもの\n\n終了すると作業が止まります。次に起動したときに、続けるかを聞きます。");
  const many = quitConfirmText([{ title: "a" }, { title: "b" }, { title: "c" }, { title: "d" }, { title: "e" }, { title: "f" }, { title: "g" }]);
  assert.equal(many.message, "作業中のチャットが 7 件あります");
  assert.deepEqual(many.detail.split("\n").slice(0, 6), ["・a", "・b", "・c", "・d", "・e", "ほか 2 件"]);
});
