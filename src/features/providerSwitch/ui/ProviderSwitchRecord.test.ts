import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";
import { makeEvent } from "@shared/chat/testing";
import { ProviderSwitchRecord } from "./ProviderSwitchRecord";

test("AI の区切りは準備した資料と応答を受け取った資料を区別して表示する", () => {
  const render = (status: "ready" | "delivered" | "superseded") => renderToStaticMarkup(createElement(ProviderSwitchRecord, { event: makeEvent(1, "provider_switched", { from: "claude", to: "codex", handoff_context: "引き継ぎの資料", handoff_status: status }) }));
  assert.match(render("ready"), /まだ引き継ぎが完了したとは限りません/);
  assert.match(render("delivered"), /応答を受け取りました/);
  assert.match(render("delivered"), /引き継ぎの資料/);
  assert.match(render("superseded"), /この内容は渡していません/);
});
