import assert from "node:assert/strict";
import { test } from "node:test";
import { knownExtension, webContentsId } from "./ipcArgs.js";

test("IPC の引数の検査: 対応している拡張機能のキーと、埋め込みブラウザの ID だけを通す", () => {
  assert.equal(knownExtension("react-devtools"), "react-devtools");
  assert.throws(() => knownExtension("unknown"), /未対応/);
  assert.throws(() => knownExtension(1), /未対応/);
  assert.throws(() => knownExtension(undefined), /未対応/);
  assert.equal(webContentsId(12), 12);
  assert.throws(() => webContentsId("12"), /正しくありません/);
  assert.throws(() => webContentsId(undefined), /正しくありません/);
});
