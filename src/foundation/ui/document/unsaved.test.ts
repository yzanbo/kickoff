import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { onTestFinished, test } from "vitest";
import { confirmLeave, dirtyUnder, flushDrafts, hasUnsaved, registerUnsaved, saveAll, useUnsaved, type UnsavedEntry } from "./unsaved";

/** 登録簿に出す（テストが終わったら外す） */
function open(entry: Partial<UnsavedEntry> & Pick<UnsavedEntry, "key">): () => void {
  const off = registerUnsaved({ surface: "files", title: entry.key, dirty: () => false, save: async () => true, ...entry });
  onTestFinished(off);
  return off;
}

test("saveAll: 書きかけのある文書だけを順に保存し、失敗しても残りを保存して数を返す", async () => {
  const order: string[] = [];
  const doc = (key: string, dirty: boolean, result: boolean | Error) =>
    open({
      key,
      dirty: () => dirty,
      save: async () => {
        order.push(key);
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

test("flushDrafts: 書きかけを残す文書（flush を持つもの）だけに頼む", () => {
  const flushed: string[] = [];
  open({ key: "note", flush: () => flushed.push("note") });
  open({ key: "file" });
  flushDrafts();
  assert.deepEqual(flushed, ["note"]);
});

test("confirmLeave: 当てはまる書きかけがなければ聞かずに進めてよい", async () => {
  open({ key: "a", surface: "notes", dirty: () => true });
  open({ key: "b", surface: "files" });
  assert.equal(await confirmLeave((e) => e.surface === "files"), true);
});

test("useUnsaved: 開いている文書のうち当てはまるものを読む", () => {
  open({ key: "a", surface: "notes" });
  open({ key: "b", surface: "files" });
  const Probe = () => useUnsaved((e) => e.surface === "notes").map((e) => e.key).join(",");
  assert.equal(renderToString(createElement(Probe)), "a");
});

test("dirtyUnder: 置き場所を問わず、その作業場所のファイル・フォルダの中の書きかけのあるファイルを返す（右の欄のファイルも数える）", () => {
  open({ key: "1::src/a.ts", surface: "files", file: { root: "1:", path: "src/a.ts" } });
  open({ key: "1::src/b.ts", surface: "agents", dirty: () => true, file: { root: "1:", path: "src/b.ts" } });
  open({ key: "1:/wt:src/c.ts", surface: "files", dirty: () => true, file: { root: "1:/wt", path: "src/c.ts" } });
  assert.equal(dirtyUnder("1:", "src"), "src/b.ts");
  assert.equal(dirtyUnder("1:", "src/b.ts"), "src/b.ts");
  assert.equal(dirtyUnder("1:", "src/a.ts"), null);
  assert.equal(dirtyUnder("1:", "docs"), null);
  assert.equal(dirtyUnder("1:/wt", ""), "src/c.ts");
});

test("hasUnsaved: 置いたタブ（tab）で引き、書きかけのあるものだけを数える", () => {
  let dirty = false;
  open({ key: "1::a.ts", tab: "files:1\npfile:1:a.ts", dirty: () => dirty });
  const inTab = (e: UnsavedEntry) => e.tab === "files:1\npfile:1:a.ts";
  assert.equal(hasUnsaved(inTab), false);
  dirty = true;
  assert.equal(hasUnsaved(inTab), true);
  assert.equal(hasUnsaved((e) => e.tab === "files:1\npfile:1:b.ts"), false);
});
