import assert from "node:assert/strict";
import { test } from "node:test";
import type { PanelTab } from "@/features/panel/tabs/panelTypes";
import { emptyPanel, panelReducer, type PanelAction, type PanelState } from "./panelState";
import { isTabShown, panelOfTab } from "./tabPlace";

const browser = (key: string): PanelTab => ({ key, kind: "browser", url: "https://example.com", title: "" });
const run = (state: PanelState, ...actions: PanelAction[]) => actions.reduce((s, a) => panelReducer(s, a, { shows: () => true, closeWhenEmpty: false }), state);

/** ブラウザのタブ a（表示中）と b（裏）の開いた欄 */
const sideOpen = run(emptyPanel(), { type: "open", tab: browser("browser:a") }, { type: "add", tab: browser("browser:b") });
const bottomClosed = run(emptyPanel(), { type: "add", tab: browser("browser:c") });

const view = (mounted: string[] = ["side:1", "bottom:1"]) => ({
  panels: new Map<string, PanelState>([
    ["side:1", sideOpen],
    ["bottom:1", bottomClosed],
    ["side:2", run(emptyPanel(), { type: "open", tab: browser("browser:d") })],
  ]),
  mounted: (key: string) => mounted.includes(key),
});

test("panelOfTab: タブのある、画面に出ている欄", () => {
  assert.equal(panelOfTab(view(), "browser:b"), "side:1");
  assert.equal(panelOfTab(view(), "browser:c"), "bottom:1");
  // ほかのプロジェクトの欄は描いていないので数えない
  assert.equal(panelOfTab(view(), "browser:d"), null);
  assert.equal(panelOfTab(view(), "browser:x"), null);
});

test("isTabShown: 欄が開いていて、そのタブを表示しているときだけ", () => {
  assert.equal(isTabShown(view(), "browser:a"), true);
  // 裏のタブ・閉じた欄のタブ・画面に出ていない欄のタブは見ていない
  assert.equal(isTabShown(view(), "browser:b"), false);
  assert.equal(isTabShown(view(), "browser:c"), false);
  assert.equal(isTabShown(view(), "browser:d"), false);
  assert.equal(isTabShown(view(["bottom:1"]), "browser:a"), false);
  // 欄を閉じたら見ていない
  const closed = { panels: new Map([["side:1", { ...sideOpen, open: false }]]), mounted: () => true };
  assert.equal(isTabShown(closed, "browser:a"), false);
});
