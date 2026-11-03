import { useEffect, useState } from "react";
import type { BusEvent, VoiceStatus } from "../../../../core/types";
import { api } from "../../api";
import { subscribeServerEvent } from "../../events";

// 音声入力の準備の状態（アプリ全体で 1 つ。チャット欄のマイクのボタンと設定の「音声入力」で共有する）

let current: VoiceStatus | undefined;
let loading: Promise<VoiceStatus> | undefined;
const listeners = new Set<(status: VoiceStatus) => void>();
let unsubscribe: (() => void) | undefined;

function set(status: VoiceStatus) {
  current = status;
  listeners.forEach((l) => l(status));
}

/** 状態を取り直す（同時に呼ばれたら 1 回だけ取る） */
export function refreshVoiceStatus(): Promise<VoiceStatus> {
  loading ??= api
    .voiceStatus()
    .then((status) => (set(status), status))
    .finally(() => (loading = undefined));
  return loading;
}

/** 取り直さずに、受け取った状態を配る（ダウンロード・削除の応答） */
export const setVoiceStatus = set;

/** サーバーの知らせ: 設定が変わったら取り直し、ダウンロードの進み具合はその場で直す（終わったら取り直して準備の状態も直す） */
function onServerEvent(e: BusEvent) {
  if (e.type === "settings") return void refreshVoiceStatus().catch(() => {});
  if (e.type !== "voice_model" || !current) return;
  const models = current.local.models.map((m) => (m.id === e.id ? { ...m, download: e.download, downloaded: e.downloaded } : m));
  set({ ...current, local: { ...current.local, models } });
  if (e.download === null) void refreshVoiceStatus().catch(() => {});
}

/** 音声入力の準備の状態（初めて使うときに取る。取れるまで undefined） */
export function useVoiceStatus(): VoiceStatus | undefined {
  const [status, setStatus] = useState(current);
  useEffect(() => {
    listeners.add(setStatus);
    unsubscribe ??= subscribeServerEvent(onServerEvent);
    if (!current) void refreshVoiceStatus().catch(() => {});
    else setStatus(current);
    return () => void listeners.delete(setStatus);
  }, []);
  return status;
}
