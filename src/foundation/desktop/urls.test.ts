import assert from "node:assert/strict";
import { test } from "vitest";
import { appNavigationAllowed, frameNavigationAllowed, isEmbeddableUrl, sameOrigin } from "./urls";

test("埋め込みブラウザで開いてよいページ: http(s) と空のページ", () => {
  assert.equal(isEmbeddableUrl("about:blank"), true);
  assert.equal(isEmbeddableUrl("https://example.com/"), true);
  assert.equal(isEmbeddableUrl("file:///etc/passwd"), false);
});

test("同じ出どころ: スキーム・ホスト・ポートが同じとき。URL として読めなければ違う", () => {
  assert.equal(sameOrigin("http://127.0.0.1:4318/#/projects/1", "http://127.0.0.1:4318"), true);
  assert.equal(sameOrigin("http://127.0.0.1:4319/", "http://127.0.0.1:4318"), false);
  assert.equal(sameOrigin("http://localhost:4318/", "http://127.0.0.1:4318"), false);
  assert.equal(sameOrigin("", "http://127.0.0.1:4318"), false);
});

test("アプリの窓の移動: アプリの出どころの中だけ通す（ほかのページ・読めない URL・アプリの URL が分からないときは止める）", () => {
  const app = "http://127.0.0.1:4318";
  assert.equal(appNavigationAllowed("http://127.0.0.1:4318/#/projects/1", app), true);
  assert.equal(appNavigationAllowed("http://127.0.0.1:4318/index.html", app), true);
  assert.equal(appNavigationAllowed("https://evil.example/", app), false);
  assert.equal(appNavigationAllowed("http://127.0.0.1:4319/", app), false);
  assert.equal(appNavigationAllowed("file:///etc/passwd", app), false);
  assert.equal(appNavigationAllowed("javascript:alert(1)", app), false);
  assert.equal(appNavigationAllowed("http://127.0.0.1:4318/", undefined), false);
  // 開発版は dev サーバーの出どころ
  assert.equal(appNavigationAllowed("http://localhost:5173/#/x", "http://localhost:5173"), true);
});

test("アプリの窓の中の枠の移動: アプリの画面の文書が作った枠の最初の読み込みだけアプリの出どころへ。srcdoc・空のページはまだ通信するページを読んでいない枠だけ", () => {
  const app = "http://127.0.0.1:4318";
  const nav = (url: string, current: string, inAppDocument = true, byAppDocument = true) => frameNavigationAllowed({ url, current, inAppDocument, byAppDocument }, app);
  // 閉じた枠のページ（図・Mermaid）を、画面の文書が作った枠に読み込む
  assert.equal(nav("http://127.0.0.1:4318/visual-frame", ""), true);
  assert.equal(nav("http://127.0.0.1:4318/mermaid-frame", "about:blank"), true);
  // 一度読んだ閉じた枠は、どこへも移れず読み込み直せない（中のスクリプトでも、画面の文書が src を替えても）
  for (const url of ["http://127.0.0.1:4318/api/projects", "http://127.0.0.1:4318/visual-frame", "about:blank", "about:srcdoc", "https://evil.example/"]) {
    assert.equal(nav(url, "http://127.0.0.1:4318/visual-frame", true, false), false, url);
    assert.equal(nav(url, "http://127.0.0.1:4318/mermaid-frame", true, true), false, url);
  }
  // 枠の中のスクリプト・リンクが始めた移動と、枠の中の枠は、アプリの出どころへ移れない
  assert.equal(nav("http://127.0.0.1:4318/api/x", "", true, false), false);
  assert.equal(nav("http://127.0.0.1:4318/api/x", "", false, false), false);
  assert.equal(nav("http://127.0.0.1:4318/visual-frame", "", false, true), false);
  // HTML のノート・ファイルのプレビューの srcdoc（入れ替えも）と、枠の中の srcdoc・空の枠
  assert.equal(nav("about:srcdoc", ""), true);
  assert.equal(nav("about:srcdoc", "about:srcdoc"), true);
  assert.equal(nav("about:srcdoc", "", false, false), true);
  assert.equal(nav("about:blank", "about:srcdoc", false, false), true);
  // srcdoc の枠もアプリの出どころへは移れない。外のページ・data:・アプリの URL が分からないときは止める
  assert.equal(nav("http://127.0.0.1:4318/api/x", "about:srcdoc"), false);
  assert.equal(nav("https://evil.example/", ""), false);
  assert.equal(nav("data:text/html,x", ""), false);
  assert.equal(frameNavigationAllowed({ url: "http://127.0.0.1:4318/visual-frame", current: "", inAppDocument: true, byAppDocument: true }, undefined), false);
});
