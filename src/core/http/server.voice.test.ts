// API のテスト: 音声入力（文字起こし・準備の状態・モデル・OpenAI の API キー。共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTH, setup, until } from "../testing/testServer.js";
import type { BusEvent, VoiceStatus } from "@shared/types";

/** 音声を multipart で送る */
async function transcribe(app: ReturnType<typeof setup>["app"], fields: Record<string, string> = {}, bytes = new Uint8Array([1, 2, 3])) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "audio/webm" }), "voice.webm");
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await app.request("/api/transcribe", { method: "POST", headers: AUTH, body: form });
  return { status: res.status, body: await res.json() };
}

test("文字起こし: 音声入力がオフ・音声がないときは 400 で理由を返し、文字起こしは呼ばない", async () => {
  const { app, voiceFake } = setup();
  const off = await transcribe(app);
  assert.equal(off.status, 400);
  assert.match(off.body.error, /音声入力がオフ/);
  const res = await app.request("/api/transcribe", { method: "POST", headers: AUTH, body: new FormData() });
  assert.equal(res.status, 400);
  assert.equal(voiceFake.calls.length, 0);
});

test("文字起こし（この Mac）: コマンド・モデルがなければ 400 で brew の案内、モデルを落とせば whisper に振り分け、言語は指定 → 設定の順", async () => {
  const { app, call, bus, voiceFake } = setup();
  const events: BusEvent[] = [];
  bus.subscribe((e) => events.push(e));
  await call("PUT", "/api/settings", { voice_enabled: true, voice_provider: "local", voice_model: "base", voice_language: "ja" });
  voiceFake.tools = { whisper: null, ffmpeg: "/fake/ffmpeg" };
  const missing = await transcribe(app);
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /whisper-cli が見つかりません.*brew install whisper-cpp ffmpeg/);
  voiceFake.tools = { whisper: "/fake/whisper-cli", ffmpeg: "/fake/ffmpeg" };
  const noModel = await transcribe(app);
  assert.equal(noModel.status, 400);
  assert.match(noModel.body.error, /モデル（base）をダウンロード/);

  // モデルを落とす（偽の fetch）。始めた時点で進み具合を返し、終わったら知らせる
  const started = await call("POST", "/api/voice/models/base/download");
  assert.equal(started.status, 202);
  assert.ok((started.body as VoiceStatus).local.models.find((m) => m.id === "base")?.download);
  await until(() => events.some((e) => e.type === "voice_model" && e.id === "base" && e.downloaded));
  const status = (await call("GET", "/api/voice")).body as VoiceStatus;
  assert.equal(status.ready, true);
  assert.equal(status.reason, null);

  const ok = await transcribe(app);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.text, "ローカルの文");
  const [first] = voiceFake.calls;
  assert.equal(first.engine, "local");
  assert.equal(first.opts.language, "ja");
  assert.match((first.opts as { model: string }).model, /ggml-base\.bin$/);
  assert.equal(first.audio.type, "audio/webm");
  assert.deepEqual([...first.audio.bytes], [1, 2, 3]);

  await transcribe(app, { language: "en" });
  assert.equal(voiceFake.calls[1].opts.language, "en");
  // 言語の形が正しくなければ 400
  assert.equal((await transcribe(app, { language: "日本語" })).status, 400);

  // 消すと、また準備ができていない
  const removed = (await call("DELETE", "/api/voice/models/base")).body as VoiceStatus;
  assert.equal(removed.local.models.find((m) => m.id === "base")?.downloaded, false);
  assert.equal(removed.ready, false);
  // 知らないモデルは 404
  assert.equal((await call("POST", "/api/voice/models/huge/download")).status, 404);
});

test("モデルのダウンロード: 失敗したら理由を残して知らせ、もう一度落とせる", async () => {
  const { call, bus, voiceFake } = setup();
  const events: BusEvent[] = [];
  bus.subscribe((e) => events.push(e));
  voiceFake.download = async () => new Response("not found", { status: 404 });
  await call("POST", "/api/voice/models/small/download");
  await until(() => events.some((e) => e.type === "voice_model" && Boolean(e.download?.error)));
  const failed = ((await call("GET", "/api/voice")).body as VoiceStatus).local.models.find((m) => m.id === "small");
  assert.match(failed?.download?.error ?? "", /HTTP 404/);
  assert.equal(failed?.downloaded, false);

  voiceFake.download = async () => new Response(new Uint8Array(10), { headers: { "content-length": "10" } });
  await call("POST", "/api/voice/models/small/download");
  await until(() => events.some((e) => e.type === "voice_model" && e.id === "small" && e.downloaded && e.download === null));
});

test("文字起こし（OpenAI）: キーがなければ 400、保存したら OpenAI に振り分ける。キーは応答・設定・配信のどこにも出さず、空で消せる", async () => {
  const { app, call, bus, voiceFake } = setup();
  const events: string[] = [];
  bus.subscribe((e) => events.push(JSON.stringify(e)));
  await call("PUT", "/api/settings", { voice_enabled: true, voice_provider: "openai", voice_openai_model: "whisper-1", voice_openai_base_url: "https://example.test/v1" });
  const noKey = await transcribe(app);
  assert.equal(noKey.status, 400);
  assert.match(noKey.body.error, /API キーがありません/);

  const saved = await call("PUT", "/api/voice/openai-key", { key: "  sk-secret-123  " });
  assert.deepEqual(saved.body, { saved: true });
  const ok = await transcribe(app);
  assert.equal(ok.body.text, "OpenAI の文");
  assert.equal(voiceFake.calls[0].engine, "openai");
  assert.deepEqual(voiceFake.calls[0].opts, { key: "sk-secret-123", baseUrl: "https://example.test/v1", model: "whisper-1", language: "ja" });

  const settings = await call("GET", "/api/settings");
  const status = await call("GET", "/api/voice");
  assert.equal(status.body.openai.key_saved, true);
  for (const text of [JSON.stringify(settings.body), JSON.stringify(status.body), ...events]) assert.ok(!text.includes("sk-secret"), text);

  assert.deepEqual((await call("PUT", "/api/voice/openai-key", { key: "" })).body, { saved: false });
  assert.equal((await call("GET", "/api/voice")).body.openai.key_saved, false);
});

test("設定: 音声入力の項目を検証する（知らない方法・モデル・http(s) 以外の URL は 400）", async () => {
  const { call } = setup();
  assert.equal((await call("PUT", "/api/settings", { voice_provider: "google" })).status, 400);
  assert.equal((await call("PUT", "/api/settings", { voice_model: "huge" })).status, 400);
  assert.equal((await call("PUT", "/api/settings", { voice_openai_base_url: "file:///etc" })).status, 400);
  assert.equal((await call("PUT", "/api/settings", { voice_language: "auto" })).status, 200);
  const defaults = (await call("GET", "/api/settings")).body;
  assert.equal(defaults.voice_enabled, false);
  assert.equal(defaults.voice_model, "large-v3-turbo-q5_0");
});
