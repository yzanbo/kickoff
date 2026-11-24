// 音声入力の取り決め（受け口は src/features/voice/core/routes/voice.ts）。どれも端末には開かない
import { blob, form, route, type Contract } from "@shared/foundation/contract";
import type { OpenAiKeyBody, SecretSaved, SpeechBody, Transcription, VoiceStatus } from "./types";

export const voiceContract = {
  /** 録った音声を文にする（multipart の file と、省けば設定の言語になる language。準備ができていなければ理由の 400） */
  "POST /api/transcribe": form<Transcription>(),
  /** 準備の状態（この Mac のモデル・macOS・OpenAI） */
  "GET /api/voice": route<never, VoiceStatus>(),
  /** 音声モードの返答を OpenAI の声で読み上げた音声（mp3。この Mac の声は画面が直接使う） */
  "POST /api/speech": blob<never, SpeechBody>(),
  /** この Mac のモデルを落とし始める（終わるのは待たない。進み具合は voice_model と状態の取り直しで分かる） */
  "POST /api/voice/models/:modelId/download": route<never, VoiceStatus>({ status: 202 }),
  /** 落としたモデルを消す（落としている途中ならやめる） */
  "DELETE /api/voice/models/:modelId": route<never, VoiceStatus>(),
  /** OpenAI の API キー（空なら消す）。キーそのものは返さず、保存したかだけを返す */
  "PUT /api/voice/openai-key": route<OpenAiKeyBody, SecretSaved>(),
} as const satisfies Contract;
