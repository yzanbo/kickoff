// 音声入力の API の呼び手（取り決めは @shared/voice/contract.ts。コアの受け口は core/routes/voice.ts）
import { voiceContract } from "@shared/voice/contract";
import { client } from "@/foundation/ui/api/client";

export const voiceApi = client(voiceContract);

/** 録った音声を文にする（言語は設定のもの。ファイル名の拡張子で形を伝える） */
export async function transcribeAudio(audio: Blob): Promise<string> {
  const file = new File([audio], `voice.${audio.type.includes("mp4") ? "m4a" : "webm"}`, { type: audio.type });
  return (await voiceApi("POST /api/transcribe", { body: { file } })).text;
}
