import assert from "node:assert/strict";
import { test } from "vitest";
import { activeTabOf, leavesOf, singlePane, type PaneLayout, type PanelTab } from "@/features/panel/ui";
import { installMemoryStorage } from "@/foundation/ui/testing/memoryStorage";
import { chatPanelSettings } from "@/features/chatPanel/ui";
import { readBrowserSession, writeBrowserSession } from "./browserSession";

const { local } = installMemoryStorage();

const first = { kind: "browser", key: "browser:first", url: "https://example.test/first", title: "最初" } as const;
const second = { kind: "browser", key: "browser:second", url: "https://example.test/second", title: "2 つ目" } as const;

test("ブラウザの復元: 最後に見た URL とタイトル、タブの順番・選択・分割をプロジェクトごとに残す", () => {
  const third = { ...first, key: "browser:third" };
  const tabs: PanelTab[] = [
    first,
    { ...second, current: "https://example.test/current?mode=1#section" },
    third,
  ];
  const left = singlePane([second.key, first.key], second.key, "left").root;
  const right = singlePane([third.key], third.key, "right").root;
  const layout: PaneLayout = { root: { type: "split", dir: "row", children: [left, right], sizes: [0.6, 0.4] }, focused: "left" };
  writeBrowserSession(1, { tabs, layout });
  const saved = readBrowserSession(1);
  assert.deepEqual(saved?.layout.root, layout.root);
  assert.equal(activeTabOf(saved!.layout), second.key);
  assert.deepEqual(saved?.tabs[1], { ...second, url: "https://example.test/current?mode=1#section", restored: true });
  assert.equal(readBrowserSession(2), null);
});

test("ブラウザの復元: 新しい空のタブを残し、資格情報や読み直せない URL は保存しない", () => {
  const tabs: PanelTab[] = [
    { ...first, url: "" },
    { ...second, current: "https://user:pass@example.test/private" },
    { ...first, key: "browser:blob", current: "blob:https://example.test/blob" },
  ];
  writeBrowserSession(1, { tabs, layout: singlePane(tabs.map((t) => t.key), null) });
  assert.deepEqual(readBrowserSession(1)?.tabs.map((t) => [t.url, t.title]), [["about:blank", ""], ["about:blank", ""], ["about:blank", ""]]);
  assert.doesNotMatch(local.getItem(chatPanelSettings.projectBrowserSession(1).key) ?? "", /user:pass|blob:https/);
});

test("ブラウザの復元: 壊れた配置・重複キー・開けない URL は安全に読み飛ばす", () => {
  local.setItem(chatPanelSettings.projectBrowserSession(1).key, JSON.stringify({
    tabs: [first, { ...first, url: "https://example.test/duplicate" }, { ...second, url: "file:///example.html" }, null],
    layout: { root: { type: "split", dir: "row", children: [], sizes: [] }, focused: "missing" },
  }));
  const saved = readBrowserSession(1)!;
  assert.deepEqual(saved.tabs, [{ ...first, restored: true }]);
  assert.deepEqual(leavesOf(saved.layout.root).map((p) => p.tabs), [[first.key]]);
  assert.equal(activeTabOf(saved.layout), first.key);
});
