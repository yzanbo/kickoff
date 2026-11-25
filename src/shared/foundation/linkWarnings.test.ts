import { test } from "vitest";
import assert from "node:assert/strict";
import { linkDomainOf, linkWarnings } from "./linkWarnings";

test("linkWarnings: リンクの文字がドメインに見え、行き先のホストと違えば text_mismatch（www. とサブドメインは同じとみなす）", () => {
  assert.deepEqual(linkWarnings("https://evil.example/login", "www.mhlw.go.jp"), ["text_mismatch"]);
  assert.deepEqual(linkWarnings("https://www.mhlw.go.jp/a", "mhlw.go.jp"), []);
  assert.deepEqual(linkWarnings("https://docs.example.com/a", "example.com"), []);
  assert.deepEqual(linkWarnings("https://example.com/a", "https://example.com/b"), []);
  // ドメインに見えない文字なら比べない
  assert.deepEqual(linkWarnings("https://evil.example/", "こちら"), []);
  assert.deepEqual(linkWarnings("https://evil.example/"), []);
});

test("linkWarnings: ユーザー名入り・国際化ドメイン名・IP アドレス（この Mac の中は除く）", () => {
  assert.deepEqual(linkWarnings("https://google.com@evil.example/"), ["userinfo"]);
  assert.deepEqual(linkWarnings("https://аpple.com/"), ["idn"]);
  assert.deepEqual(linkWarnings("http://203.0.113.5/a"), ["ip"]);
  assert.deepEqual(linkWarnings("http://[2001:db8::1]/a"), ["ip"]);
  assert.deepEqual(linkWarnings("http://127.0.0.1:3000/"), []);
  assert.deepEqual(linkWarnings("http://localhost:5173/"), []);
  // http(s) でなければ見ない
  assert.deepEqual(linkWarnings("mailto:a@example.com"), []);
});

test("linkDomainOf: 「今後確認しない」はホスト名の小文字（ポートなし）で覚える", () => {
  assert.equal(linkDomainOf("https://Docs.Example.com:8443/a"), "docs.example.com");
  assert.equal(linkDomainOf("mailto:a@example.com"), null);
});

test("linkWarnings: リンクの文字にほかの文字・空白・見えない文字が混ざっていても、URL・ドメインに見える語があれば行き先と比べる", () => {
  for (const text of [
    "https://good.example x",
    "https://good.example…",
    "https://good.example\u200b",
    "https://go\u200bod.example",
    "公式 good.example のページ",
    "（https://good.example）",
    "https://good.\u202eexample",
  ]) {
    assert.deepEqual(linkWarnings("https://evil.example/", text), ["text_mismatch"], JSON.stringify(text));
  }
  // 同じホスト・サブドメイン・URL に見える語のない文字は当たらない
  assert.deepEqual(linkWarnings("https://docs.good.example/a", "詳しくは https://good.example x を"), []);
  assert.deepEqual(linkWarnings("https://evil.example/", "ここを押す"), []);
});

test("linkWarnings: ファイル名に見える文字（README.md・src/a.ts など）は比べず、http(s)://・www. で始まる語とドメインは比べる", () => {
  for (const text of ["README.md", "src/a.ts", "package.json", "docs/architecture.md を見る", "pnpm-lock.yaml", "main.py:12"]) {
    assert.deepEqual(linkWarnings("https://github.com/o/r/blob/main/README.md", text), [], text);
  }
  for (const [href, text] of [
    ["https://evil.example/github.com", "github.com"],
    ["https://evil.example", "https://good.example/x"],
    ["https://evil.example", "www.good.example"],
    ["https://evil.example", "www.good.md"],
    ["https://evil.example", "good.io"],
    ["https://evil.example", "example.co.jp"],
  ]) {
    assert.deepEqual(linkWarnings(href, text), ["text_mismatch"], `${text} → ${href}`);
  }
});
