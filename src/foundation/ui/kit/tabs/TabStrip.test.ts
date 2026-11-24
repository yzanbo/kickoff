import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { test } from "vitest";
import { TabStrip } from "./TabStrip";
import { useTabs } from "./useTabs";

/** 最初の描画: 列に tablist と向き、タブに tab・aria-selected・aria-controls、中身に tabpanel を付ける */
test("TabStrip: タブの列とタブ・中身の役割をつなぐ", () => {
  const Probe = () => {
    const tabs = useTabs({ keys: ["a", "b"], value: "b", onChange: () => {}, orientation: "vertical", label: "項目" });
    return createElement(
      "div",
      null,
      createElement(TabStrip<"a" | "b">, { tabs, items: [{ key: "a", label: "A" }, { key: "b", label: "B", closable: true }], onClose: () => {} }),
      createElement("div", tabs.panelProps("b"), "中身"),
    );
  };
  const html = renderToString(createElement(Probe));
  assert.match(html, /role="tablist" aria-label="項目" aria-orientation="vertical"/);
  assert.equal(html.match(/role="tab"/g)?.length, 2);
  const selected = /id="([^"]+)" role="tab" aria-selected="true" aria-controls="([^"]+)"/.exec(html);
  assert.ok(selected);
  assert.match(html, new RegExp(`id="${selected[2]}" role="tabpanel" aria-labelledby="${selected[1]}"`));
  // 閉じるボタンは closable のタブだけ（タブの外に置く）
  assert.equal(html.match(/aria-label="閉じる"/g)?.length, 1);
});
