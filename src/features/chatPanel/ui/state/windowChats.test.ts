import assert from "node:assert/strict";
import { test } from "vitest";
import { makeChat } from "@shared/foundation/testing/factories";
import { installMemoryStorage } from "@/foundation/ui/storage/memoryStorage";
import { chatTab, openTab, panelStateOf } from "@/features/panel/ui";
import { useChatPanelTestStore } from "@/features/chatPanel/ui/testing";
import { holdChatsElsewhere } from "./windowChats";

installMemoryStorage();

test("別ウィンドウにあるチャット: メインのウィンドウのチャットのパネルにタブがあれば閉じる（ないチャットの欄はそのまま）", () => {
  useChatPanelTestStore();
  openTab("kanban:1", chatTab(makeChat(1, { project_id: 1 })));
  openTab("kanban:1", chatTab(makeChat(2, { project_id: 1 })));
  holdChatsElsewhere([{ panel: "kanban:1", chatId: 1 }]);
  assert.deepEqual(
    panelStateOf("kanban:1").tabs.map((t) => t.key),
    ["chat:2"],
  );
});
