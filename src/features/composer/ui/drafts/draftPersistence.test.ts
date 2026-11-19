import assert from "node:assert/strict";
import { test } from "vitest";
import { installMemoryStorage } from "@/foundation/ui/storage/memoryStorage";
import { NEW_CHAT_DRAFTS } from "@/foundation/ui/storage/storageKeys";
import { moveDraftsToChatPanels, readSavedDrafts, writeDrafts, type DraftTab } from "./draftPersistence";
import type { PanelTab } from "@/features/panel/ui/usePanel";

const { local } = installMemoryStorage();

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

test("チャットの別ウィンドウの下書き: 作成先のプロジェクトのチャットのパネルの後ろへ移し、元の分は消す", () => {
  const saved = new Map([
    ["cwin:win-1-chat:5", [draftOf("new:a", 1), draftOf("new:b", 2)]],
    ["kanban:1", [draftOf("new:x", 1)]],
    ["side:2", [draftOf("new:y", 2)]],
  ]);
  const moved = moveDraftsToChatPanels(saved);
  assert.deepEqual(
    [...moved],
    [
      ["kanban:1", [draftOf("new:x", 1), draftOf("new:a", 1)]],
      ["side:2", [draftOf("new:y", 2)]],
      ["kanban:2", [draftOf("new:b", 2)]],
    ],
  );
  // 元の Map は書き換えない
  assert.equal(saved.get("cwin:win-1-chat:5")?.length, 2);
});

test("チャットの別ウィンドウの下書き: 同じタブが移す先にあれば重ねず、移すものがなければ同じ Map を返す", () => {
  const twice = moveDraftsToChatPanels(new Map([["cwin:win-1-chat:5", [draftOf("new:a", 1)]], ["kanban:1", [draftOf("new:a", 1)]]]));
  assert.deepEqual([...twice], [["kanban:1", [draftOf("new:a", 1)]]]);
  const none = new Map([["kanban:1", [draftOf("new:x", 1)]]]);
  assert.equal(moveDraftsToChatPanels(none), none);
});
