import assert from "node:assert/strict";
import { test } from "vitest";
import { extensionOrigin, isManagedExtensionDir, knownExtensionDir } from "./extensionDirs";

test("消してよい拡張機能のフォルダ: 保存先のすぐ下だけ。.. を含むパス・保存先そのもの・隣のフォルダ・中のフォルダは消さない", () => {
  const root = "/data/browser-extensions";
  assert.equal(isManagedExtensionDir(root, "/data/browser-extensions/react-devtools"), true);
  assert.equal(isManagedExtensionDir(root, "/data/browser-extensions/chrome-react-devtools/"), true);
  // startsWith だけで比べると、これらも rm -rf してしまう
  assert.equal(isManagedExtensionDir(root, "/data/browser-extensions/../../Users/me"), false);
  assert.equal(isManagedExtensionDir(root, "/data/browser-extensions/.."), false);
  assert.equal(isManagedExtensionDir(root, "/data/browser-extensions-other/x"), false);
  assert.equal(isManagedExtensionDir(root, "/data/browser-extensions"), false);
  assert.equal(isManagedExtensionDir(root, "/data/browser-extensions/react-devtools/icons"), false);
  assert.equal(isManagedExtensionDir(root, "react-devtools"), false);
});

test("拡張機能の出どころ: 保存先のすぐ下はキーか「chrome-キー」で読み、それ以外はフォルダを指定したもの", () => {
  const root = "/data/browser-extensions";
  assert.deepEqual(extensionOrigin(root, knownExtensionDir(root, "vue-devtools", "webstore")), { source: "webstore", key: "vue-devtools" });
  assert.deepEqual(extensionOrigin(root, knownExtensionDir(root, "redux-devtools", "chrome-profile")), { source: "chrome-profile", key: "redux-devtools" });
  // 知らない名前は、出どころだけ読む
  assert.deepEqual(extensionOrigin(root, "/data/browser-extensions/old-thing"), { source: "webstore", key: null });
  assert.deepEqual(extensionOrigin(root, "/data/browser-extensions/chrome-old-thing"), { source: "chrome-profile", key: null });
  assert.deepEqual(extensionOrigin(root, "/Users/me/my-extension"), { source: "folder", key: null });
  assert.deepEqual(extensionOrigin(root, "/data/browser-extensions/../react-devtools"), { source: "folder", key: null });
});
