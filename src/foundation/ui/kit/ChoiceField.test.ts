import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { test } from "vitest";
import { ChoiceField, SwitchField } from "./ChoiceField";
import { Segmented } from "./Segmented";

test("Segmented: look で見た目のクラスを決め、なければ className、どちらもなければ segmented", () => {
  const options = [{ value: "a", label: "A" }, { value: "b", label: "B" }];
  const html = (props: Record<string, string>) => renderToString(createElement(Segmented<string>, { label: "組", value: "a", options, onChange: () => {}, ...props }));
  assert.match(html({}), /class="segmented" role="radiogroup"/);
  assert.match(html({ look: "switch" }), /class="segmented theme-switch"/);
  assert.match(html({ look: "toggle", className: "queue-mode" }), /class="view-toggle queue-mode"/);
  assert.match(html({ className: "segmented db-view-switch" }), /class="segmented db-view-switch"/);
});

test("ChoiceField・SwitchField: 名前を 1 回書き、選んでいるもの（SwitchField はオン・オフ）に aria-checked を付ける", () => {
  const choice = renderToString(createElement(ChoiceField<string>, { label: "テーマ", value: "dark", options: [{ value: "light", label: "ライト" }, { value: "dark", label: "ダーク" }], onChange: () => {} }));
  assert.match(choice, /aria-label="テーマ"/);
  assert.match(choice, /aria-checked="true"[^>]*data-value="dark"/);
  const on = renderToString(createElement(SwitchField, { label: "音", checked: false, onChange: () => {}, onLabel: "鳴らす", offLabel: "鳴らさない" }));
  assert.match(on, /aria-checked="true"[^>]*data-value="off"/);
});
