import assert from "node:assert/strict";
import { onTestFinished, test } from "vitest";
import { installMemoryStorage } from "@/foundation/ui/storage/memoryStorage";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { NEW_CHAT_DRAFTS } from "@/foundation/ui/storage/storageKeys";
import { writeDrafts } from "@/features/composer/ui/drafts/draftPersistence";
import { isSidePanel, terminalKeysOf } from "./panelHandOff";
import { openTab } from "./actions";
import { terminalTab } from "@/features/panel/ui/tabs/tabData";
import { testTabKind, useTestPanelStore } from "@/features/panel/ui/testing";
import { panelStateOf, putPanels, setPanelOwnership, takePanels } from "./panelStore";

installMemoryStorage();

const draft = (key: string, projectId: number) => ({ key, kind: "new" as const, projectId });

test("writeDrafts: このウィンドウが持たない欄の下書きは、残っているものをそのまま残す（チャット欄を別ウィンドウへ移している間）", () => {
  writeSetting(NEW_CHAT_DRAFTS, { "side:1": [draft("new:s", 1)], "kanban:1": [draft("new:old", 1)] });
  writeDrafts(
    [
      ["kanban:1", [draft("new:k", 1)]],
      ["side:1", []],
    ],
    (panel) => !isSidePanel(panel),
  );
  assert.deepEqual(readSetting(NEW_CHAT_DRAFTS), { "side:1": [draft("new:s", 1)], "kanban:1": [draft("new:k", 1)] });
});

test("チャット欄の受け渡し: 取り出すときも戻すときもタブの後始末をしない（ターミナルのシェルを止めない）", () => {
  // 閉じたタブの後始末（ターミナルならシェルを止める）を呼んだか
  const closed: string[] = [];
  useTestPanelStore({ kinds: [testTabKind("terminal", { dispose: (t) => closed.push(t.key) })] });
  onTestFinished(() => setPanelOwnership(() => true));
  const key = "side:9201";
  openTab(key, terminalTab({ cwd: "/repo", label: "p", projectId: 9201 }));
  const before = panelStateOf(key);
  const taken = takePanels((k) => k === key);
  assert.equal(taken.length, 1);
  assert.deepEqual(terminalKeysOf(taken), [before.tabs[0].key]);
  assert.notEqual(panelStateOf(key), before);
  putPanels((k) => k === key, taken);
  assert.equal(panelStateOf(key), before);
  assert.deepEqual(closed, []);
});
