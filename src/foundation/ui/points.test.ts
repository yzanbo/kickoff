import assert from "node:assert/strict";
import { test } from "vitest";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { definePoint, installContributions, lazyPart, swapContributions } from "./points";

/** 入れる前の形にして fn を流し、元の登録に戻す（ほかのテストが入れた登録を残さない） */
function uninstalled(fn: () => void) {
  const restore = swapContributions(null);
  try {
    fn();
  } finally {
    restore();
  }
}

test("definePoint: 入れる前に読むと投げる", () => {
  const point = definePoint<string>("見本");
  uninstalled(() => assert.throws(() => point.items(), /拡張点 見本 は登録の前に読まれた/));
});

test("installContributions: 入れると読め、2 回目は投げる", () => {
  const point = definePoint<number>("数");
  uninstalled(() => {
    installContributions([point.item(1)]);
    assert.deepEqual(point.items(), [1]);
    assert.throws(() => installContributions([]), /1 回だけ/);
  });
});

test("definePoint: key が重なったら入れるときに投げる。点ごとに分け、項目のない点は空", () => {
  const tabs = definePoint<{ id: string }>("タブ", { key: (t) => t.id });
  const other = definePoint<string>("ほか");
  assert.throws(() => swapContributions([tabs.item({ id: "a" }), tabs.item({ id: "a" })]), /拡張点 タブ に同じ key「a」が 2 つある/);
  useTestContributions([tabs.item({ id: "a" }), tabs.item({ id: "b" })]);
  assert.deepEqual(tabs.items(), [{ id: "a" }, { id: "b" }]);
  assert.deepEqual(other.items(), []);
});

test("definePoint: order があればその順（同じ順位は登録の順）、なければ登録の順", () => {
  const footer = definePoint<{ id: string; order: number }>("帯", { order: (a, b) => a.order - b.order });
  const plain = definePoint<string>("順");
  useTestContributions([footer.item({ id: "c", order: 2 }), plain.item("y"), footer.item({ id: "a", order: 1 }), footer.item({ id: "b", order: 1 }), plain.item("x")]);
  assert.deepEqual(
    footer.items().map((f) => f.id),
    ["a", "b", "c"],
  );
  assert.deepEqual(plain.items(), ["y", "x"]);
});

test("テストで入れて戻す: 戻す関数で入れる前の形になる（useTestContributions はテストの終わりにこれを呼ぶ）", () => {
  const point = definePoint<string>("戻す");
  uninstalled(() => {
    const restore = swapContributions([point.item("テスト")]);
    assert.deepEqual(point.items(), ["テスト"]);
    restore();
    assert.throws(() => point.items(), /登録の前/);
  });
});

test("lazyPart: preload は 1 回だけ読む（描くときも同じ読み込みを使う）", async () => {
  let loads = 0;
  const Part = lazyPart(async () => {
    loads++;
    return { default: () => null };
  });
  await Part.preload();
  await Part.preload();
  assert.equal(loads, 1);
});
