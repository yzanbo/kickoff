// 音声入力の SSE の種類
import { event, type EventsOf, type EventTable } from "@shared/foundation/contract";
import type { VoiceDownload } from "./types";

export const voiceEvents = {
  /** 音声入力のモデルのダウンロードの進み具合（download が null なら終わった・やめた。downloaded はファイルがあるか） */
  voice_model: event<{ id: string; download: VoiceDownload | null; downloaded: boolean }>(),
} as const satisfies EventTable;

declare module "@shared/foundation/contract" {
  interface ServerEventMap extends EventsOf<typeof voiceEvents> {}
}
