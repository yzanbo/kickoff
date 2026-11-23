import assert from "node:assert/strict";
import { onTestFinished, test } from "vitest";
import { Globe } from "lucide-react";
import { publishServerEvent } from "@/foundation/ui/api/events";
import { installMemoryStorage } from "@/foundation/ui/testing/memoryStorage";
import {
  activeTabOf,
  browserTab,
  closeTab,
  createPanelStore,
  defineTabKind,
  installPanelStore,
  openTab,
  panelStateOf,
  patchTab,
  setPanelOpen,
  showTab,
  startPanelServerEvents,
  takePanels,
} from "@/features/panel/ui";
import { readBrowserSession } from "./browserSession";
import { sideSurface } from "./browserSurfaces";

installMemoryStorage();

/** 右サイドバーの欄だけの店（ブラウザの種類は中身を描かない）。サーバーの知らせも受ける */
function useSideStore() {
  const kind = defineTabKind({ id: "browser", icon: Globe, label: () => "", projectOf: () => undefined, Page: () => null });
  const before = installPanelStore(createPanelStore({ kinds: [kind], surfaces: [sideSurface] }));
  onTestFinished(() => void installPanelStore(before));
  onTestFinished(startPanelServerEvents());
}

const keys = (panel: string) => panelStateOf(panel).tabs.map((t) => t.key);

// 保存（localStorage）はファイルの中で続くので、テストごとに別のプロジェクトの欄を使う

test("右サイドバーのブラウザ: 隠しても開いていたページと選択を復元し、個別に閉じたタブは復元しない", () => {
  useSideStore();
  const key = "side:31";
  const start = browserTab("https://example.test/start");
  const other = browserTab("https://example.test/other");
  openTab(key, start);
  openTab(key, other);
  const [first, second] = [start.key, other.key];
  patchTab(key, first, { kind: "browser", fields: { current: "https://example.test/next", title: "次のページ" } });
  showTab(key, first);
  setPanelOpen(key, false);
  // メモリの状態を外し、読み込み直したときと同じように保存から作る
  takePanels((panel) => panel === key);
  assert.equal(panelStateOf(key).open, false);
  assert.deepEqual(keys(key), [first, second]);
  assert.equal(activeTabOf(panelStateOf(key).layout), first);
  assert.deepEqual(panelStateOf(key).tabs[0], { kind: "browser", key: first, url: "https://example.test/next", title: "次のページ", restored: true });
  closeTab(key, first);
  assert.deepEqual(readBrowserSession(31)?.tabs.map((t) => t.key), [second]);
  closeTab(key, second);
  assert.equal(readBrowserSession(31), null);
});

test("削除したプロジェクトのブラウザのタブは保存からも外す", () => {
  useSideStore();
  openTab("side:32", browserTab("https://example.test"));
  takePanels((key) => key === "side:32");
  assert.ok(readBrowserSession(32));
  publishServerEvent({ type: "project_deleted", id: 32 });
  assert.equal(readBrowserSession(32), null);
});
