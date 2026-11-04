// 音声入力の準備の状態（アプリ全体で 1 つ。チャット欄のマイクのボタンと設定の「音声入力」で共有する）。
// 設定が変わったら取り直し、モデルのダウンロードの進み具合はその場で直す（終わったら取り直して、準備の状態も直す）
import type { BusEvent, VoiceStatus } from "@shared/types";
import { api } from "@/api";
import { createStore } from "./createStore";
import { useStore } from "./useStore";

/** ダウンロードの進み具合の知らせを、そのモデルに当てる */
export function reduceVoiceStatus(status: VoiceStatus, event: BusEvent): VoiceStatus {
  if (event.type !== "voice_model") return status;
  const models = status.local.models.map((m) => (m.id === event.id ? { ...m, download: event.download, downloaded: event.downloaded } : m));
  return { ...status, local: { ...status.local, models } };
}

/** ダウンロード・削除の応答（そのあとの状態）は set で入れる */
export const voiceStatusStore = createStore<VoiceStatus>({
  load: () => api.voiceStatus(),
  reduce: reduceVoiceStatus,
  reloadOn: (e) => e.type === "settings" || (e.type === "voice_model" && e.download === null),
});

/** 音声入力の準備の状態（data は初めて使うときに取る。取れるまで undefined） */
export const useVoiceStatus = () => useStore(voiceStatusStore);
