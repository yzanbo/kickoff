// 文字起こしの純粋関数（コマンドの引数・出力の整形・OpenAI の応答とエラー・準備の確かめ・コマンドの探し方）
import assert from "node:assert/strict";
import { test } from "node:test";
import { audioExtension, commandFailure, ffmpegArgs, joinSegments, whisperArgs } from "./local.js";
import { modelFile, modelUrl, WHISPER_MODELS } from "./models.js";
import { openAiFailure, parseTranscription, transcribeOpenAi, transcriptionForm, transcriptionUrl } from "./openai.js";
import { voiceUnreadyReason } from "./readiness.js";
import { findExecutable, searchDirs } from "./tools.js";

const audio = { bytes: new Uint8Array([1, 2]), name: "voice.webm", type: "audio/webm;codecs=opus" };

test("ffmpeg と whisper-cli の引数: 16kHz・モノラルの wav にし、時刻なし・途中経過なしで txt に書く", () => {
  assert.deepEqual(ffmpegArgs("/t/in.webm", "/t/a.wav").slice(-9), ["-i", "/t/in.webm", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", "/t/a.wav"]);
  assert.deepEqual(whisperArgs({ model: "/m/ggml-base.bin", wav: "/t/a.wav", language: "ja", outBase: "/t/r", threads: 4 }), [
    "-m", "/m/ggml-base.bin", "-f", "/t/a.wav", "-l", "ja", "-t", "4", "-nt", "-np", "-otxt", "-of", "/t/r",
  ]);
  assert.equal(audioExtension("audio/webm;codecs=opus"), "webm");
  assert.equal(audioExtension("audio/mp4"), "m4a");
  assert.equal(audioExtension(""), "bin");
});

test("whisper の出力の整形: 日本語どうしは詰め、英語は空白でつなぎ、無音の印は除く", () => {
  assert.equal(joinSegments(" こんにちは。\n 今日は晴れです。\n"), "こんにちは。今日は晴れです。");
  assert.equal(joinSegments("Hello there.\nHow are you?"), "Hello there. How are you?");
  assert.equal(joinSegments("README を\n直して"), "README を直して");
  assert.equal(joinSegments("Kickoff の\nREADME"), "Kickoff の README");
  assert.equal(joinSegments("[BLANK_AUDIO]\n"), "");
});

test("コマンドの失敗の文: 標準エラーの最後の行を添える", () => {
  const e = Object.assign(new Error("Command failed"), { stderr: "whisper_init: loading\nerror: failed to open model\n" });
  assert.equal(commandFailure("whisper-cli", e), "whisper-cli が失敗しました: error: failed to open model");
  assert.equal(commandFailure("ffmpeg", new Error("spawn ENOENT")), "ffmpeg が失敗しました: spawn ENOENT");
});

test("モデル: おすすめは 1 つだけで、Hugging Face の whisper.cpp から ggml の形で落とし、保存先の下に置く", () => {
  assert.equal(WHISPER_MODELS.filter((m) => m.recommended).length, 1);
  assert.equal(modelUrl("large-v3-turbo-q5_0"), "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin");
  assert.equal(modelFile("/data/models", "base"), "/data/models/ggml-base.bin");
});

test("OpenAI: URL は Base URL（空なら OpenAI）の後ろに付け、言語が自動なら送らない", async () => {
  assert.equal(transcriptionUrl(""), "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(transcriptionUrl("http://localhost:8000/v1/"), "http://localhost:8000/v1/audio/transcriptions");
  const form = transcriptionForm(audio, { model: "gpt-4o-transcribe", language: "ja" });
  assert.equal(form.get("model"), "gpt-4o-transcribe");
  assert.equal(form.get("language"), "ja");
  assert.equal((form.get("file") as File).name, "voice.webm");
  assert.equal(transcriptionForm(audio, { model: "whisper-1", language: "auto" }).get("language"), null);
});

test("OpenAI: 応答から文を取り出し、失敗は状態コードごとに案内する", async () => {
  assert.equal(parseTranscription({ text: " こんにちは " }), "こんにちは");
  assert.throws(() => parseTranscription({}), /形が正しくありません/);
  assert.match(openAiFailure(401, { error: { message: "Incorrect API key provided" } }), /API キーが正しくありません.*Incorrect API key/);
  assert.match(openAiFailure(429, null), /上限に達しました.*HTTP 429/);
  assert.match(openAiFailure(413, null), /25MB/);
  assert.match(openAiFailure(500, { error: { message: "boom" } }), /失敗しました（boom）/);

  // キーは Authorization で送り、失敗の文は振り分けたもの
  let seen: { url: string; auth: string | null } | undefined;
  const fake = (async (url: string, init: RequestInit) => {
    seen = { url, auth: new Headers(init.headers).get("authorization") };
    return new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 });
  }) as typeof fetch;
  await assert.rejects(transcribeOpenAi(audio, { key: "sk-1", baseUrl: "", model: "whisper-1", language: "ja" }, fake), /API キーが正しくありません/);
  assert.deepEqual(seen, { url: "https://api.openai.com/v1/audio/transcriptions", auth: "Bearer sk-1" });
  const down = (async () => Promise.reject(new Error("ECONNREFUSED"))) as typeof fetch;
  await assert.rejects(transcribeOpenAi(audio, { key: "k", baseUrl: "http://localhost:9/v1", model: "m", language: "ja" }, down), /つながりません（localhost:9）/);
});

test("準備の確かめ: オフ → 方法ごとに足りないもの（キー / コマンド / モデル）の順に理由を返す", () => {
  const tools = { whisper: "/w", ffmpeg: "/f" };
  const base = { settings: { voice_enabled: true, voice_provider: "local" as const, voice_model: "base" }, tools, modelDownloaded: true, keySaved: false };
  assert.equal(voiceUnreadyReason(base), null);
  assert.match(voiceUnreadyReason({ ...base, settings: { ...base.settings, voice_enabled: false } }) ?? "", /オフ/);
  assert.match(voiceUnreadyReason({ ...base, tools: { whisper: null, ffmpeg: null } }) ?? "", /whisper-cli と ffmpeg が見つかりません/);
  assert.match(voiceUnreadyReason({ ...base, modelDownloaded: false }) ?? "", /モデル（base）をダウンロード/);
  assert.match(voiceUnreadyReason({ ...base, settings: { ...base.settings, voice_provider: "openai" } }) ?? "", /API キー/);
  assert.equal(voiceUnreadyReason({ ...base, settings: { ...base.settings, voice_provider: "openai" }, tools: { whisper: null, ffmpeg: null }, keySaved: true }), null);
});

test("コマンドの探し方: PATH の順、なければ Homebrew の場所。名前は今の名前を先に", () => {
  assert.deepEqual(searchDirs("/usr/bin:/opt/homebrew/bin"), ["/usr/bin", "/opt/homebrew/bin", "/usr/local/bin"]);
  const files = new Set(["/opt/homebrew/bin/whisper-cpp", "/usr/local/bin/whisper-cli"]);
  assert.equal(findExecutable(["whisper-cli", "whisper-cpp"], ["/opt/homebrew/bin", "/usr/local/bin"], (f) => files.has(f)), "/usr/local/bin/whisper-cli");
  assert.equal(findExecutable(["ffmpeg"], ["/opt/homebrew/bin"], (f) => files.has(f)), null);
});
