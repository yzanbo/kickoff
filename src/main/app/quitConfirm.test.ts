import assert from "node:assert/strict";
import { test } from "vitest";
import { UNTITLED_CHAT_TITLE } from "@shared/types";
import { quitConfirmText } from "./quitConfirm.js";

test("終了してよいかの文: 件数を見出しに、名前を 5 件まで並べ（名前がなければ既定の名前）、残りは数だけ", () => {
  const one = quitConfirmText([{ title: "調べもの" }]);
  assert.equal(one.message, "作業中のチャットが 1 件あります");
  assert.equal(one.detail, "・調べもの\n\n終了すると作業が止まります。次に起動したときに、続けるかを聞きます。");
  const many = quitConfirmText([{ title: "a" }, { title: null }, { title: " " }, { title: "d" }, { title: "e" }, { title: "f" }, { title: "g" }]);
  assert.equal(many.message, "作業中のチャットが 7 件あります");
  assert.deepEqual(many.detail.split("\n").slice(0, 6), ["・a", `・${UNTITLED_CHAT_TITLE}`, `・${UNTITLED_CHAT_TITLE}`, "・d", "・e", "ほか 2 件"]);
});
