import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { test } from "vitest";
import { useQuery, type QueryKey, type QueryResult } from "./index";

/** 最初の描画の結果だけを見る（effect は流れないので、取りに行く前の様子） */
function firstRender(key: QueryKey | null, enabled = true): QueryResult<number> {
  let result: QueryResult<number> | undefined;
  const Probe = () => {
    result = useQuery(key, async () => 1, { enabled });
    return null;
  };
  renderToString(createElement(Probe));
  return result!;
}

test("useQuery: 最初の描画から読み込み中に見せ、key が null・enabled が false なら取りに行かない", () => {
  assert.deepEqual([firstRender(["a", 1]).loading, firstRender(["a", 1]).loaded], [true, false]);
  assert.equal(firstRender(null).loading, false);
  assert.equal(firstRender("a", false).loading, false);
});
