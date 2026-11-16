import { test } from "vitest";
import assert from "node:assert/strict";
import { purgeMessage, remainingText } from "./trashText";

test("remainingText: 消えるまでの残りを日・時間・分で", () => {
  const now = Date.parse("2026-11-14T00:00:00Z");
  const at = (min: number) => new Date(now + min * 60_000).toISOString();
  assert.equal(remainingText(at(2 * 24 * 60 + 5 * 60 + 30), now), "あと 2 日 5 時間");
  assert.equal(remainingText(at(3 * 24 * 60), now), "あと 3 日");
  assert.equal(remainingText(at(3 * 60 + 10), now), "あと 3 時間");
  assert.equal(remainingText(at(12), now), "あと 12 分");
  assert.equal(remainingText(at(-5), now), "あと 0 分");
});

test("purgeMessage: 元に戻せないことと、入っている種類ごとに一緒に消えるものを 1 回ずつ添える", () => {
  assert.equal(purgeMessage(["file"]), "3 日を待たずに、いますぐ消します。元に戻せません。");
  assert.equal(purgeMessage(["chat", "file", "chat"]), "3 日を待たずに、いますぐ消します。元に戻せません。チャットは会話の記録ごと消えます。");
  assert.match(purgeMessage(["project"]), /プロジェクトのフォルダは消えません/);
});
