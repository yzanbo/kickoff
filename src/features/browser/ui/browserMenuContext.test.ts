import assert from "node:assert/strict";
import { test } from "vitest";
import { browserMenuContext } from "./browserMenuContext";

const plain = { isEditable: false, formControlType: "none", selectionText: "", linkURL: "", mediaType: "none", hasImageContents: false, srcURL: "" } as const;

test("余白と選択した文字のメニューは分け、入力欄の文は外へ渡さない", () => {
  assert.equal(browserMenuContext(plain).pageActions, true);
  const selected = browserMenuContext({ ...plain, selectionText: " 選んだ文字 " });
  assert.equal(selected.selection, " 選んだ文字 ");
  assert.equal(selected.pageActions, false);
  const input = browserMenuContext({ ...plain, isEditable: true, selectionText: "入力した文" });
  assert.equal(input.selection, null);
  assert.equal(input.pageActions, false);
  const password = browserMenuContext({ ...plain, formControlType: "input-password", selectionText: "パスワード" });
  assert.equal(password.password, true);
  assert.equal(password.selection, null);
});

test("リンク付き画像は両方の操作を出すが、ページを開く操作は http(s) に限る", () => {
  const linked = browserMenuContext({ ...plain, mediaType: "image", hasImageContents: true, srcURL: "data:image/png;base64,AAA=", linkURL: "https://example.test" });
  assert.equal(linked.linkUrl, "https://example.test/");
  assert.equal(linked.copyImage, true);
  assert.equal(linked.mediaUrl, null);
  assert.equal(linked.downloadUrl, "data:image/png;base64,AAA=");
  assert.equal(linked.pageActions, false);
  const mail = browserMenuContext({ ...plain, linkURL: "mailto:web@example.test" });
  assert.equal(mail.linkAddress, "mailto:web@example.test");
  assert.equal(mail.linkUrl, null);
  const blocked = browserMenuContext({ ...plain, linkURL: "javascript:void(0)", mediaType: "image", srcURL: "file:///private/tmp/example.png" });
  assert.equal(blocked.linkAddress, null);
  assert.equal(blocked.mediaUrl, null);
  assert.equal(blocked.downloadUrl, null);
});
