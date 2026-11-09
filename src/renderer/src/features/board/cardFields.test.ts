import assert from "node:assert/strict";
import { test } from "node:test";
import { makeChat } from "@shared/testing/factories";
import { cardFieldSections, cardStatText, toggleCardField } from "./cardFields";

test("cardFieldSections: プロジェクトは全プロジェクトのボードだけ", () => {
  const items = (all: boolean) => cardFieldSections(all).flatMap((s) => s.items);
  assert.equal(items(true).includes("project"), true);
  assert.equal(items(false).includes("project"), false);
  assert.equal(items(false).includes("state"), true);
});

test("toggleCardField: 隠す・出すを入れ替え、項目の順にそろえる", () => {
  assert.deepEqual(toggleCardField(["cost", "model"], "state"), ["state", "model", "cost"]);
  assert.deepEqual(toggleCardField(["model", "cost"], "model"), ["cost"]);
});

test("cardStatText: 値がない・0 なら出さない", () => {
  const chat = makeChat(1, { num_turns: 12, cost_usd: 0.456, context_tokens: 50_000, context_window: 200_000 });
  assert.equal(cardStatText(chat, "turns"), "12 ターン");
  assert.equal(cardStatText(chat, "cost"), "$0.46");
  assert.equal(cardStatText(chat, "context"), "25%");
  const empty = makeChat(2, { num_turns: 0, cost_usd: 0, context_tokens: null, context_window: null });
  assert.equal(cardStatText(empty, "turns"), undefined);
  assert.equal(cardStatText(empty, "cost"), undefined);
  assert.equal(cardStatText(empty, "context"), undefined);
});
