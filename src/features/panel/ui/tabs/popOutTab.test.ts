import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { installMemoryStorage } from "@/foundation/ui/storage/memoryStorage";
import { popoutKinds } from "@/foundation/ui/navigation/popout";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { testTabKind, useTestPanelStore } from "@/features/panel/ui/testing";
import { openTab } from "@/features/panel/ui/state/actions";
import { browserTab } from "./tabData";
import { popOutTab } from "./popOutTab";

installMemoryStorage();

/** 別ウィンドウで開ける種類のタブを 1 つ開き、閉じた記録を返す（別ウィンドウの種類は中身を描かない sidebar を借りる） */
function setup(openPopout: () => Promise<void>) {
  useTestPanelStore({ kinds: [testTabKind("browser", { popout: () => ({ route: { kind: "sidebar" }, title: "t" }) })] });
  useTestContributions([popoutKinds.item({ kind: "sidebar", fields: {}, label: "", Page: () => null })]);
  vi.stubGlobal("window", { kickoff: { windows: { openPopout } } });
  const tab = browserTab("https://example.com");
  openTab("side:1", tab);
  const closed: string[] = [];
  return { key: tab.key, closed, panel: { key: "side:1", closeTab: (key: string) => void closed.push(key) } };
}

test("popOutTab: 別ウィンドウが開いてから元のタブを閉じる", async () => {
  let opened: () => void = () => {};
  const { key, closed, panel } = setup(() => new Promise<void>((resolve) => (opened = resolve)));
  popOutTab(panel, key);
  // まだ開いていない
  assert.deepEqual(closed, []);
  opened();
  await vi.waitFor(() => assert.deepEqual(closed, [key]));
});

test("popOutTab: 別ウィンドウを開けなければ元のタブを閉じない", async () => {
  const { key, closed, panel } = setup(() => Promise.reject(new Error("開けない")));
  popOutTab(panel, key);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(closed, []);
});
