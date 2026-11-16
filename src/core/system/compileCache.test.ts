import assert from "node:assert/strict";
import { test } from "vitest";
import { COMPILE_CACHE_ARG, compileCacheDirOf } from "./compileCache.js";

test("起動の引数からコンパイルキャッシュの場所を読む", () => {
  assert.equal(compileCacheDirOf(["/x/Electron", "/x/core.js", `${COMPILE_CACHE_ARG}/data/compile-cache/v/core`]), "/data/compile-cache/v/core");
});

test("引数がない・空ならキャッシュを使わない", () => {
  assert.equal(compileCacheDirOf(["/x/Electron", "/x/core.js"]), null);
  assert.equal(compileCacheDirOf([COMPILE_CACHE_ARG]), null);
});
