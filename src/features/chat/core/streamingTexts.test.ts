import assert from "node:assert/strict";
import { test } from "vitest";
import { makeChat, makeEvent } from "@shared/foundation/testing/factories";
import type { BusInput } from "@shared/types";
import { StreamingTexts } from "./streamingTexts";

const delta = (chat_id: number, text: string): BusInput => ({ type: "chat_delta", project_id: 1, chat_id, text });

test("途中の文をチャットごとにつなぎ、流す chat_delta に書きかけの文の中の位置を付ける", () => {
  const texts = new StreamingTexts();
  assert.deepEqual(texts.track(delta(7, "こん")), { ...delta(7, "こん"), offset: 0 });
  assert.deepEqual(texts.track(delta(8, "やあ")), { ...delta(8, "やあ"), offset: 0 });
  assert.deepEqual(texts.track(delta(7, "にちは")), { ...delta(7, "にちは"), offset: 2 });
  assert.equal(texts.textOf(7), "こんにちは");
  assert.equal(texts.textOf(8), "やあ");
  assert.equal(texts.textOf(9), null);
});

test("メインエージェントの確定した記録・作業中でなくなった・消したチャットで捨て、サブエージェントの記録では捨てない", () => {
  const texts = new StreamingTexts();
  texts.track(delta(7, "途中"));
  texts.track({ type: "chat_event", project_id: 1, event: makeEvent(1, "text", { text: "サブ", parent: "toolu_1" }, { chat_id: 7 }) });
  assert.equal(texts.textOf(7), "途中");
  texts.track({ type: "chat_event", project_id: 1, event: makeEvent(2, "text", { text: "途中" }, { chat_id: 7 }) });
  assert.equal(texts.textOf(7), null);
  // 捨てたあとの文は、位置 0 から始まる
  assert.deepEqual(texts.track(delta(7, "次")), { ...delta(7, "次"), offset: 0 });
  texts.track({ type: "chat", chat: makeChat(7, { status: "completed" }) });
  assert.equal(texts.textOf(7), null);
  texts.track(delta(7, "また"));
  texts.track({ type: "chat_deleted", id: 7, project_id: 1 });
  assert.equal(texts.textOf(7), null);
});
