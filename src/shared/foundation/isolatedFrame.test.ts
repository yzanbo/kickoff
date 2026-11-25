import assert from "node:assert/strict";
import { test } from "vitest";
import { isolatedFrameCsp } from "./isolatedFrame";

test("isolatedFrameCsp: default-src 'none' に足した読み込み先だけを書き、通信・枠・フォーム・base はいつも止める（空の並びは書かない）", () => {
  assert.equal(
    isolatedFrameCsp({ script: ["'sha256-x'"], img: ["data:"], font: [] }),
    "default-src 'none'; script-src 'sha256-x'; img-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'",
  );
  assert.equal(isolatedFrameCsp({}), "default-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'");
});
