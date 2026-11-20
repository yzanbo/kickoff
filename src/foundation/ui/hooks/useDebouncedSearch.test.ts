import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { test } from "vitest";
import { useObjectUrl } from "./useObjectUrl";
import { useDebouncedSearch } from "./useDebouncedSearch";

/** 最初の描画（effect は流れない）: まだ探しておらず、URL も作っていない */
test("useDebouncedSearch・useObjectUrl: 最初は結果が空で読み込み中でなく、URL もない", () => {
  const Probe = () => {
    const found = useDebouncedSearch("abc", async () => ["x"]);
    const url = useObjectUrl(new Blob(["a"]));
    return `${found.results.length}:${found.loading}:${url === undefined}`;
  };
  assert.equal(renderToString(createElement(Probe)), "0:false:true");
});
