import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrowserConsoleEntry } from "@shared/ipc";
import { consoleDocument, consoleLabelOf, pageHostOf, pageLinkOf, screenLabelOf } from "./consoleDocument";

const entry = (over: Partial<BrowserConsoleEntry>): BrowserConsoleEntry => ({
  level: "error",
  message: "boom",
  source: "http://localhost:5173/src/main.ts",
  line: 12,
  url: "http://localhost:5173/login",
  at: "2026-11-13T03:00:00.000Z",
  ...over,
});

test("pageHostOf / pageLinkOf: http(s) はホストとポート・リンクあり、空のページとほかの URL はリンクなし", () => {
  assert.equal(pageHostOf("http://localhost:5173/login?x=1"), "localhost:5173");
  assert.equal(pageHostOf("about:blank"), "空のページ");
  assert.equal(pageHostOf("file:///tmp/a.html"), "file:///tmp/a.html");
  assert.equal(pageLinkOf("https://example.com/a"), "https://example.com/a");
  assert.equal(pageLinkOf("about:blank"), null);
});

test("screenLabelOf: 題とホスト。題がない・URL と同じならホストだけ", () => {
  assert.equal(screenLabelOf({ url: "http://localhost:5173/login", title: "ログイン" }), "ログイン（localhost:5173）");
  assert.equal(screenLabelOf({ url: "http://localhost:5173/", title: " " }), "localhost:5173");
  assert.equal(screenLabelOf({ url: "http://localhost:5173/", title: "http://localhost:5173/" }), "localhost:5173");
});

test("consoleLabelOf: ホストと、0 でない種類の数", () => {
  const page = { url: "http://localhost:5173/" };
  assert.equal(consoleLabelOf(page, [entry({}), entry({}), entry({ level: "warning" })]), "localhost:5173・エラー 2・警告 1");
  assert.equal(consoleLabelOf(page, [entry({ level: "warning" })]), "localhost:5173・警告 1");
});

test("consoleDocument: いまのページと数・古い順の出力（時刻・種類・複数行の字下げ・場所・出たページ）", () => {
  const doc = consoleDocument(
    { url: "http://localhost:5173/home", title: "ホーム" },
    [entry({ message: "TypeError: x is undefined\n    at main.ts:12" }), entry({ level: "warning", message: "deprecated", source: null, url: "http://localhost:5173/home" })],
    () => "12:00:01",
  );
  assert.match(doc, /^# ブラウザのコンソールのエラーと警告/);
  assert.match(doc, /- いまのページ: ホーム — http:\/\/localhost:5173\/home\n- エラー 1 件・警告 1 件/);
  assert.match(doc, /### \[エラー\] 12:00:01\n\nTypeError: x is undefined\n {8}at main\.ts:12\n\n- 場所: http:\/\/localhost:5173\/src\/main\.ts:12\n- ページ: http:\/\/localhost:5173\/login/);
  assert.match(doc, /### \[警告\] 12:00:01\n\ndeprecated\n\n- ページ: http:\/\/localhost:5173\/home\n$/);
});
