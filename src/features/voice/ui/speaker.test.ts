import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { Speaker } from "./speaker";

// OpenAI の声の音声を頼んだときの signal を控える（返事は返さない = 頼んでいる途中）
const signals = vi.hoisted(() => [] as AbortSignal[]);
vi.mock("@/foundation/ui/api", () => ({
  api: {
    speech: (_text: string, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<Blob>(() => {});
    },
  },
}));

test("読み上げ: 止めたら、先に頼んだ OpenAI の声の音声も取り消す", async () => {
  const speaker = new Speaker(() => ({ voice_tts_provider: "openai", voice_tts_voice: "", voice_tts_rate: 1, voice_language: "ja" }), () => {}, () => {});
  speaker.enqueue("最初の文です。\n\n次の段落の文です。");
  await Promise.resolve();
  assert.ok(signals.length >= 1);
  assert.ok(signals.every((s) => !s.aborted));
  speaker.stop();
  assert.ok(signals.every((s) => s.aborted));
});
