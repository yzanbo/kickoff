import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { test } from "vitest";
import { useDebouncedSearch } from "./useDebouncedSearch";

/** 最初の描画（effect は流れない）: まだ探していない */
test("useDebouncedSearch: 最初は結果が空で読み込み中でない", () => {
  const Probe = () => {
    const found = useDebouncedSearch("abc", async () => ["x"]);
    return `${found.results.length}:${found.loading}`;
  };
  assert.equal(renderToString(createElement(Probe)), "0:false");
});
