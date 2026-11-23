import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { test } from "vitest";
import { createFakeScheduler } from "@shared/foundation/testing/fakeScheduler";
import { overlayCount } from "./overlayCount";
import { showProgressToast, ToastHost } from "./toast";

test("showProgressToast: 回る印つきで出し、done で結果の文とボタンに替えて、少しあとに消す", () => {
  const clock = createFakeScheduler();
  const progress = showProgressToast("ノートに追加しています…", clock);
  const busy = renderToString(createElement(ToastHost));
  assert.match(busy, /class="spinner small"/);
  assert.match(busy, /ノートに追加しています…/);
  // 進行中は時間では消さない
  clock.advance(60_000);
  progress.done("ノートに追加しました", { label: "開く", run: () => {} });
  const done = renderToString(createElement(ToastHost));
  assert.doesNotMatch(done, /spinner/);
  assert.match(done, /ノートに追加しました/);
  assert.match(done, />開く</);
  clock.advance(6000);
  // ほかのテストが出した知らせが残っていてもよいように、この知らせが消えたことだけを見る
  assert.doesNotMatch(renderToString(createElement(ToastHost)), /ノートに追加しました/);
  // 重なりの数は effect で数えるので、最初の描画では変わらない
  assert.equal(overlayCount.get(), 0);
});
