import assert from "node:assert/strict";
import { test } from "node:test";
import { isManagedExtensionDir } from "./extensionDirs.js";

test("消してよい拡張機能のフォルダ: 保存先のすぐ下だけ。.. を含むパス・保存先そのもの・隣のフォルダ・中のフォルダは消さない", () => {
  const root = "/data/browser-extensions";
  assert.equal(isManagedExtensionDir(root, "/data/browser-extensions/react-devtools"), true);
  assert.equal(isManagedExtensionDir(root, "/data/browser-extensions/chrome-react-devtools/"), true);
  // 以前は startsWith だけで比べていたので、これらも rm -rf していた
  assert.equal(isManagedExtensionDir(root, "/data/browser-extensions/../../Users/me"), false);
  assert.equal(isManagedExtensionDir(root, "/data/browser-extensions/.."), false);
  assert.equal(isManagedExtensionDir(root, "/data/browser-extensions-other/x"), false);
  assert.equal(isManagedExtensionDir(root, "/data/browser-extensions"), false);
  assert.equal(isManagedExtensionDir(root, "/data/browser-extensions/react-devtools/icons"), false);
  assert.equal(isManagedExtensionDir(root, "react-devtools"), false);
});
