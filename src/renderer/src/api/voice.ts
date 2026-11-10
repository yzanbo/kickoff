import type { SecretSaved, Transcription, VoiceStatus } from "@shared/types";
import { postForBlob, postForm, request } from "./http";

/** 音声入力（文字起こし・読み上げ・準備の状態・この Mac のモデル・OpenAI の API キー。コアの routes/voice.ts） */
export const voiceApi = {
  /** 録った音声を文にする（language を省けば設定の言語） */
  transcribe: (audio: Blob, language?: string) => {
    const form = new FormData();
    form.append("file", audio, `voice.${audio.type.includes("mp4") ? "m4a" : "webm"}`);
    if (language) form.append("language", language);
    return postForm<Transcription>("/api/transcribe", form);
  },
  /** 音声モードの返答を OpenAI の声で読み上げた音声（mp3。声・速さは設定のもの） */
  speech: (text: string, signal?: AbortSignal) => postForBlob("/api/speech", { text }, signal),
  voiceStatus: () => request<VoiceStatus>("GET", "/api/voice"),
  downloadVoiceModel: (id: string) => request<VoiceStatus>("POST", `/api/voice/models/${encodeURIComponent(id)}/download`),
  deleteVoiceModel: (id: string) => request<VoiceStatus>("DELETE", `/api/voice/models/${encodeURIComponent(id)}`),
  /** OpenAI の API キーを保存する（空なら消す）。キーは返らず、保存したかだけ */
  saveOpenAiKey: (key: string) => request<SecretSaved>("PUT", "/api/voice/openai-key", { key }),
};
