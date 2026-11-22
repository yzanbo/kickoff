import assert from "node:assert/strict";
import { onTestFinished, test } from "vitest";
import { installMemoryStorage } from "@/foundation/ui/storage/memoryStorage";
import { terminalKeysOf } from "./panelHandOff";
import { openTab } from "./actions";
import { terminalTab } from "@/features/panel/ui/tabs/tabData";
import { testTabKind, useTestPanelStore } from "@/features/panel/ui/testing";
import { panelStateOf, putPanels, setPanelOwnership, takePanels } from "./panelStore";

installMemoryStorage();

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
