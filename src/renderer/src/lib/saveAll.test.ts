import assert from "node:assert/strict";
import { test } from "node:test";
import { registerSavable, saveAll } from "./saveAll";

test("saveAll: 書きかけのある文書だけを順に保存し、失敗しても残りを保存して数を返す", async () => {
  const order: string[] = [];
  const doc = (name: string, dirty: boolean, result: boolean | Error) =>
    registerSavable({
      dirty: () => dirty,
      save: async () => {
        order.push(name);
        if (result instanceof Error) throw result;
        return result;
      },
    });
  const offs = [doc("a", true, true), doc("b", false, true), doc("c", true, false), doc("d", true, new Error("x")), doc("e", true, true)];
  assert.deepEqual(await saveAll(), { saved: 2, failed: 2 });
  assert.deepEqual(order, ["a", "c", "d", "e"]);
  // やめた文書は保存しない
  offs.forEach((off) => off());
  order.length = 0;
  assert.deepEqual(await saveAll(), { saved: 0, failed: 0 });
  assert.deepEqual(order, []);
});
