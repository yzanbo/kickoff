import { z } from "zod";
import { voiceContract } from "@shared/voice/contract";
import { findWhisperModel } from "@shared/voice/models";
import { SPEECH_TEXT_MAX, type OpenAiKeyBody, type SpeechBody } from "@shared/voice/types";
import type { VoiceService } from "@/features/voice/core/service";
import { voiceLanguage } from "@/features/voice/core/settings";
import { Invalid } from "@/foundation/core/errors";
import { implement, textParam } from "@/foundation/core/http/implement";
import { formFields } from "@/foundation/core/http/zodParts";

/** 受け取る音声の大きさの上限（OpenAI の文字起こしの API と同じ 25MB） */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const keySchema = z.object({ key: z.string().max(500) }) satisfies z.ZodType<OpenAiKeyBody>;
const speechSchema = z.object({ text: z.string().trim().min(1).max(SPEECH_TEXT_MAX) }) satisfies z.ZodType<SpeechBody>;
/** モデルの id（知らないものは 404） */
const voiceModel = textParam(z.string(), findWhisperModel, "文字起こしのモデルが見つかりません");

/** 音声入力: 文字起こし・準備の状態・この Mac のモデルの管理・OpenAI の API キー */
export function voiceRoutes({ voice }: { voice: VoiceService }) {
  return implement(voiceContract, {
    context: { modelId: voiceModel },
    // チャット欄のマイクで録った音声を文にする
    "POST /api/transcribe": {
      body: formFields,
      run: async ({ body: { file, language } }) => {
        if (!(file instanceof File)) throw new Invalid("音声がありません");
        if (file.size === 0) throw new Invalid("音声が空です");
        if (file.size > MAX_AUDIO_BYTES) throw new Invalid("音声が大きすぎます（25MB まで）。短く区切って話してください");
        const lang = typeof language === "string" && language ? voiceLanguage.parse(language) : undefined;
        const audio = { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name || "audio.webm", type: file.type };
        // 準備ができていない（未設定・モデルがない）・コマンドや API の失敗は、理由を 400 で返す
        return { text: await voice.transcribe(audio, lang) };
      },
    },
    "GET /api/voice": { run: () => voice.status() },
    "POST /api/speech": {
      body: speechSchema,
      run: async ({ body }) => ({ bytes: (await voice.speak(body.text)) as Uint8Array<ArrayBuffer>, type: "audio/mpeg", cache: "no-store" }),
    },
    "POST /api/voice/models/:modelId/download": {
      run: async ({ modelId: model }) => {
        voice.downloads.start(model.id);
        return voice.status();
      },
    },
    "DELETE /api/voice/models/:modelId": {
      run: async ({ modelId: model }) => {
        await voice.downloads.remove(model.id);
        return voice.status();
      },
    },
    "PUT /api/voice/openai-key": { body: keySchema, run: ({ body }) => voice.saveOpenAiKey(body.key) },
  });
}
