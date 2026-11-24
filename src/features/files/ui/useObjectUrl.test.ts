import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { test } from "vitest";
import { useObjectUrl } from "./useObjectUrl";

/** 最初の描画（effect は流れない）: まだ URL を作っていない */
test("useObjectUrl: 最初は URL がない", () => {
  const Probe = () => String(useObjectUrl(new Blob(["a"])) === undefined);
  assert.equal(renderToString(createElement(Probe)), "true");
});
