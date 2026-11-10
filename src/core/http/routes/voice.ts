import type { Hono } from "hono";
import { z } from "zod";
import type { ServerDeps } from "../server.js";
import { findWhisperModel } from "../../voice/models.js";
import { Invalid, NotFound } from "../errors.js";
import { jsonBody } from "../input.js";
import { voiceLanguage } from "./schemas.js";
import { SPEECH_TEXT_MAX, type Transcription } from "@shared/types";

/** 受け取る音声の大きさの上限（OpenAI の文字起こしの API と同じ 25MB） */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const keySchema = z.object({ key: z.string().max(500) });
const speechSchema = z.object({ text: z.string().trim().min(1).max(SPEECH_TEXT_MAX) });

/** モデルの id（知らないものは 404） */
function requireVoiceModel(id: string) {
  const model = findWhisperModel(id);
  if (!model) throw new NotFound("文字起こしのモデルが見つかりません");
  return model;
}

/** 音声入力: 文字起こし・準備の状態・この Mac のモデルの管理・OpenAI の API キー */
export function voiceRoutes(app: Hono, { voice }: ServerDeps) {
  // チャット欄のマイクで録った音声を文にする（multipart の file と、省けば設定の言語になる language）
  app.post("/api/transcribe", async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) throw new Invalid("音声がありません");
    if (file.size === 0) throw new Invalid("音声が空です");
    if (file.size > MAX_AUDIO_BYTES) throw new Invalid("音声が大きすぎます（25MB まで）。短く区切って話してください");
    const language = typeof body.language === "string" && body.language ? voiceLanguage.parse(body.language) : undefined;
    const audio = { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name || "audio.webm", type: file.type };
    // 準備ができていない（未設定・モデルがない）・コマンドや API の失敗は、理由を 400 で返す
    const transcription: Transcription = { text: await voice.transcribe(audio, language) };
    return c.json(transcription);
  });

  app.get("/api/voice", async (c) => c.json(await voice.status()));

  // 音声モードの返答を OpenAI の声で読み上げる（mp3 をそのまま返す。この Mac の声は画面が直接使う）
  app.post("/api/speech", async (c) => {
    const { text } = speechSchema.parse(await jsonBody(c));
    const audio = await voice.speak(text);
    return c.body(audio as Uint8Array<ArrayBuffer>, 200, { "content-type": "audio/mpeg", "cache-control": "no-store" });
  });

  // モデルを落とし始める（終わるのは待たない。進み具合は voice_model のイベントと、状態の取り直しで分かる）
  app.post("/api/voice/models/:id/download", async (c) => {
    voice.downloads.start(requireVoiceModel(c.req.param("id")).id);
    return c.json(await voice.status(), 202);
  });

  // 落としたモデルを消す（落としている途中ならやめる）
  app.delete("/api/voice/models/:id", async (c) => {
    await voice.downloads.remove(requireVoiceModel(c.req.param("id")).id);
    return c.json(await voice.status());
  });

  // OpenAI の API キー（空なら消す）。キーそのものは返さず、保存したかだけを返す
  app.put("/api/voice/openai-key", async (c) => {
    const { key } = keySchema.parse(await jsonBody(c));
    return c.json(voice.saveOpenAiKey(key));
  });
}
