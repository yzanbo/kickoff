import assert from "node:assert/strict";
import { test } from "vitest";
import { headingSlug, noteLinkTarget } from "./noteLinkTarget";

test("noteLinkTarget: 外のページ・見出し・開けない形", () => {
  assert.deepEqual(noteLinkTarget("https://example.com/a", "a.md"), { kind: "web", url: "https://example.com/a" });
  assert.deepEqual(noteLinkTarget("www.example.com", "a.md"), { kind: "web", url: "http://www.example.com/" });
  assert.deepEqual(noteLinkTarget("#%E8%A6%8B%E5%87%BA%E3%81%97", "a.md"), { kind: "heading", id: "見出し" });
  assert.equal(noteLinkTarget("mailto:a@b.c", "a.md").kind, "none");
  assert.equal(noteLinkTarget("/etc/hosts", "a.md").kind, "none");
  assert.equal(noteLinkTarget("", "a.md").kind, "none");
});

test("noteLinkTarget: 相対のパスはノートの入ったフォルダから読む（%20 は戻す・外は開かない）", () => {
  assert.deepEqual(noteLinkTarget("付録_移動表.md", "開発履歴/計画/進み具合.md"), { kind: "note", path: "開発履歴/計画/付録_移動表.md" });
  assert.deepEqual(noteLinkTarget("../リファクタ%20計画書.html", "開発履歴/計画/進み具合.md"), { kind: "note", path: "開発履歴/リファクタ 計画書.html" });
  assert.deepEqual(noteLinkTarget("../調査/", "開発履歴/計画/進み具合.md"), { kind: "file", path: "開発履歴/調査" });
  assert.deepEqual(noteLinkTarget("./img/a.png?x=1", "a.md"), { kind: "file", path: "img/a.png" });
  assert.deepEqual(noteLinkTarget("b.md#節", "dir/a.md"), { kind: "note", path: "dir/b.md" });
  assert.equal(noteLinkTarget("../../外.md", "dir/a.md").kind, "none");
});

test("headingSlug: 小文字・空白は -・記号を除く（日本語はそのまま）", () => {
  assert.equal(headingSlug("Hello World!"), "hello-world");
  assert.equal(headingSlug("4. 振る舞い（案）"), "4-振る舞い案");
});
