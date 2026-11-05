import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { installMemoryStorage } from "@/lib/memoryStorage";
import { NEW_CHAT_DRAFTS } from "@/lib/storageKeys";
import { moveAllProjectsBoardDrafts, readSavedDrafts, writeDrafts, type DraftTab } from "./draftPersistence";
import type { PanelTab } from "@/features/panel/usePanel";

const { local } = installMemoryStorage();
beforeEach(() => local.clear());

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
  assert.equal(local.getItem(NEW_CHAT_DRAFTS.key), null);
});

test("下書きの保存: 壊れた値・形の違うものは読まない", () => {
  local.setItem(NEW_CHAT_DRAFTS.key, "{");
  assert.equal(readSavedDrafts().size, 0);
  local.setItem(NEW_CHAT_DRAFTS.key, JSON.stringify({ "kanban:1": [{ key: "new:a", kind: "new" }, { kind: "chat" }], "side:2": "x" }));
  assert.equal(readSavedDrafts().size, 0);
});

const draftOf = (key: string, projectId: number): DraftTab => ({ key, kind: "new", projectId });

test("全プロジェクトのボードの下書き: 作成先のプロジェクトのボードのパネルの後ろへ移し、全プロジェクトの分は消す", () => {
  const saved = new Map([
    ["kanban:all", [draftOf("new:a", 1), draftOf("new:b", 2)]],
    ["kanban:1", [draftOf("new:x", 1)]],
    ["side:2", [draftOf("new:y", 2)]],
  ]);
  const moved = moveAllProjectsBoardDrafts(saved);
  assert.deepEqual(
    [...moved],
    [
      ["kanban:1", [draftOf("new:x", 1), draftOf("new:a", 1)]],
      ["side:2", [draftOf("new:y", 2)]],
      ["kanban:2", [draftOf("new:b", 2)]],
    ],
  );
  // 元の Map は書き換えない
  assert.equal(saved.get("kanban:all")?.length, 2);
});

test("全プロジェクトのボードの下書き: 同じタブが移す先にあれば重ねず、移すものがなければ同じ Map を返す", () => {
  const twice = moveAllProjectsBoardDrafts(new Map([["kanban:all", [draftOf("new:a", 1)]], ["kanban:1", [draftOf("new:a", 1)]]]));
  assert.deepEqual([...twice], [["kanban:1", [draftOf("new:a", 1)]]]);
  const none = new Map([["kanban:1", [draftOf("new:x", 1)]]]);
  assert.equal(moveAllProjectsBoardDrafts(none), none);
});
