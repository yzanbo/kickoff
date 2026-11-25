import assert from "node:assert/strict";
import { test } from "vitest";
import { deferred } from "@shared/foundation/testing/async";
import { EMPTY_STATE_COUNTS } from "@/features/chat/ui";
import { createDockIconUpdater } from "./dockIconUpdater";

const running = { ...EMPTY_STATE_COUNTS, running: 2 };
const unread = { ...EMPTY_STATE_COUNTS, unread: 8 };

function setup() {
  const base = deferred<string | null>();
  const shown: (string | null)[] = [];
  let loads = 0;
  const update = createDockIconUpdater({
    loadBase: () => { loads++; return base.promise; },
    draw: (image, counts) => `${image}:${counts.running}/${counts.unread}`,
    setIcon: (url) => shown.push(url),
  });
  return { update, base, shown, loads: () => loads };
}

test("下地は一度だけ読み、読み込みを待つ間に届いた最新の数だけを描く", async () => {
  const { update, base, shown, loads } = setup();
  const first = update(running);
  const second = update(unread);
  base.resolve("icon");
  await Promise.all([first, second]);
  assert.deepEqual(shown, ["icon:0/8"]);
  await update(running);
  assert.deepEqual(shown, ["icon:0/8", "icon:2/0"]);
  assert.equal(loads(), 1);
});

test("全件 0・画面を外すときは元に戻し、待っていた古い描画を当てない", async () => {
  for (const reset of [EMPTY_STATE_COUNTS, null]) {
    const { update, base, shown, loads } = setup();
    await update(reset);
    assert.equal(loads(), 0);
    const pending = update(running);
    await update(reset);
    base.resolve("icon");
    await pending;
    assert.deepEqual(shown, [null, null]);
  }
});

test("下地を読めないときは元のアイコンのままにする", async () => {
  const { update, base, shown } = setup();
  const pending = update(running);
  base.reject(new Error("下地を読めない"));
  await pending;
  assert.deepEqual(shown, [null]);
});
