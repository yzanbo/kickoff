import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { NEW_CHAT_DRAFTS_KEY } from "../../storageKeys";
import { readSavedDrafts, writeDrafts } from "./draftPersistence";
import type { PanelTab } from "./useSidePanel";

// テスト用の localStorage（Node にはないので、文字列の Map で代わりにする）
const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
});
beforeEach(() => store.clear());

const draft = (key: string, text?: string): PanelTab => ({ key, kind: "new", projectId: 1, group: 2, groupName: "実装", draftText: text });

test("下書きの保存: 新しいチャットのタブだけをパネルごとに残し、読み戻せる", () => {
  writeDrafts([
    ["kanban:1", [draft("new:a", "書きかけ"), { key: "browser:x", kind: "browser", url: "https://example.com" } as PanelTab]],
    ["side:1", [draft("new:b")]],
    ["kanban:all", []],
  ]);
  const saved = readSavedDrafts();
  assert.deepEqual([...saved.keys()], ["kanban:1", "side:1"]);
  assert.deepEqual(saved.get("kanban:1"), [draft("new:a", "書きかけ")]);
});

test("下書きの保存: 下書きがなくなったらキーごと消す", () => {
  writeDrafts([["kanban:1", [draft("new:a")]]]);
  writeDrafts([["kanban:1", []]]);
  assert.equal(store.has(NEW_CHAT_DRAFTS_KEY), false);
});

test("下書きの保存: 壊れた値・形の違うものは読まない", () => {
  store.set(NEW_CHAT_DRAFTS_KEY, "{");
  assert.equal(readSavedDrafts().size, 0);
  store.set(NEW_CHAT_DRAFTS_KEY, JSON.stringify({ "kanban:1": [{ key: "new:a", kind: "new" }, { kind: "chat" }], "side:2": "x" }));
  assert.equal(readSavedDrafts().size, 0);
});
