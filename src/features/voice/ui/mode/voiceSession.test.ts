import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";
import { VoiceSession, type VoiceModeState } from "./voiceSession";

// 偽の録音・マイク・読み上げ（本物のマイクと声は使わない）
const fake = vi.hoisted(() => ({
  level: null as ((level: number, now: number) => void) | null,
  recordings: [] as { cancelled: boolean }[],
  spoken: [] as string[],
  stops: 0,
  onSpeaking: null as ((speaking: boolean) => void) | null,
}));
vi.mock("@/features/voice/ui/capture/recorder", () => ({
  openMic: async () => ({ getTracks: () => [] }),
  watchLevel: (_stream: unknown, fn: (level: number, now: number) => void) => {
    fake.level = fn;
    return () => {};
  },
  recordStream: () => {
    const rec = { cancelled: false };
    fake.recordings.push(rec);
    return { stop: async () => [new Blob(["声"])], cancel: () => void (rec.cancelled = true) };
  },
}));
vi.mock("./speaker", () => ({
  Speaker: class {
    constructor(_settings: unknown, onSpeaking: (speaking: boolean) => void) {
      fake.onSpeaking = onSpeaking;
    }
    enqueue(text: string) {
      fake.spoken.push(text);
      fake.onSpeaking?.(true);
    }
    stop() {
      fake.stops++;
      fake.onSpeaking?.(false);
    }
  },
}));

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

/** ms の間、50ms ごとにその音量を渡す */
function feed(level: number, ms: number) {
  for (let t = 0; t < ms; t += 50) {
    vi.advanceTimersByTime(50);
    fake.level?.(level, Date.now());
  }
}

async function session() {
  vi.useFakeTimers();
  onTestFinished(() => void vi.useRealTimers());
  Object.assign(fake, { level: null, recordings: [], spoken: [], stops: 0, onSpeaking: null });
  const delivered: string[] = [];
  const states: VoiceModeState[] = [];
  let muted = false;
  const s = new VoiceSession({
    deliver: async (text) => void delivered.push(text),
    transcribe: async () => "こんにちは",
    speakerSettings: () => ({ voice_tts_provider: "system", voice_tts_voice: "", voice_tts_rate: 1, voice_language: "ja" }),
    onState: (state) => void states.push(state),
    onHeard: () => {},
    onError: () => {},
    onLevel: () => {},
    onMuted: (m) => void (muted = m),
    onEnd: () => {},
  });
  await s.start([{ id: 1, text: "前からある返答" }], true);
  return { s, delivered, state: () => states.at(-1), muted: () => muted };
}

test("音声モード: 話したあと 1.5 秒黙ったら文字にして渡す（その前には渡さない）", async () => {
  const { delivered } = await session();
  feed(0.2, 300);
  feed(0, 1400);
  await flush();
  assert.deepEqual(delivered, []);
  feed(0, 200);
  await flush();
  assert.deepEqual(delivered, ["こんにちは"]);
});

test("音声モード: 30 秒声がなければ録音を作り直す（黙っている間の音声を溜めない）", async () => {
  await session();
  feed(0, 29_000);
  assert.equal(fake.recordings.length, 1);
  feed(0, 1_100);
  assert.equal(fake.recordings.length, 2);
  assert.equal(fake.recordings[0].cancelled, true);
});

test("音声モード: 読み上げ中は録らず、大きく 0.4 秒以上話すと止めて聞き、次に送るか作業が終わるまで読まない", async () => {
  const { s, state, muted } = await session();
  s.update([{ id: 2, text: "返答です" }], true);
  assert.deepEqual(fake.spoken, ["返答です"]);
  assert.equal(state()?.kind, "speaking");
  assert.equal(fake.recordings[0].cancelled, true);
  // 小さい声・短い声では止めない
  feed(0.3, 300);
  assert.equal(state()?.kind, "speaking");
  feed(0, 100);
  feed(0.3, 500);
  assert.deepEqual(state(), { kind: "listening", heard: true });
  assert.equal(muted(), true);
  // 止めている間に届いた返答は読まない
  s.update([{ id: 3, text: "次の返答" }], true);
  assert.deepEqual(fake.spoken, ["返答です"]);
  // 作業が終わったら戻す
  s.update([{ id: 3, text: "次の返答" }], false);
  assert.equal(muted(), false);
});

test("音声モード: 話している途中・起こしている間に届いた返答は、渡し終えてから読む", async () => {
  const { s, delivered } = await session();
  feed(0.2, 300);
  s.update([{ id: 2, text: "途中の返答" }], true);
  assert.deepEqual(fake.spoken, []);
  feed(0, 1600);
  await flush();
  assert.deepEqual(delivered, ["こんにちは"]);
  assert.deepEqual(fake.spoken, ["途中の返答"]);
});
