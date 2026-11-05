import assert from "node:assert/strict";
import { test } from "node:test";
import { handBackText } from "./childChats";

test("handBackText: どの子チャットの答えかを添えて、答えを引用にする（空行も引用の中に残す）", () => {
  assert.equal(handBackText({ title: "違い" }, "A です。\n\nB です。\n"), "子チャット「違い」の答え:\n> A です。\n>\n> B です。\n\n");
  assert.equal(handBackText({ title: "" }, "x"), "子チャット「Untitled Chat」の答え:\n> x\n\n");
});
