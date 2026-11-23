import assert from "node:assert/strict";
import { onTestFinished, test } from "vitest";
import { installMemoryStorage } from "@/foundation/ui/testing/memoryStorage";
import { takeSidePanelsBack } from "./panelHandOff";
import { openTab } from "./actions";
import { terminalTab } from "@/features/panel/ui/tabs/tabData";
import { testTabKind, useTestPanelStore } from "@/features/panel/ui/testing";
import { panelStateOf, setPanelOwnership, takePanels } from "./panelStore";

installMemoryStorage();

test("チャット欄の受け渡し: 取り出すときも戻すときもタブの後始末をせず（ターミナルのシェルを止めない）、戻したタブは種類の onMoveToWindow で受け取る", async () => {
  // 閉じたタブの後始末（ターミナルならシェルを止める）と、受け取り（シェルの持ち主になる）を呼んだか
  const closed: string[] = [];
  const moved: string[] = [];
  useTestPanelStore({ kinds: [testTabKind("terminal", { dispose: (t) => closed.push(t.key), onMoveToWindow: (t) => void moved.push(t.key) })] });
  onTestFinished(() => setPanelOwnership(() => true));
  const key = "side:9201";
  openTab(key, terminalTab({ cwd: "/repo", label: "p", projectId: 9201 }));
  const before = panelStateOf(key);
  const taken = takePanels((k) => k === key);
  assert.equal(taken.length, 1);
  assert.notEqual(panelStateOf(key), before);
  await takeSidePanelsBack(taken);
  assert.equal(panelStateOf(key), before);
  assert.deepEqual(moved, [before.tabs[0].key]);
  assert.deepEqual(closed, []);
});
