import { useSyncExternalStore } from "react";
import { describeActivity } from "./activity";
import { subscribeServerEvent } from "./events";

// チャットごとの、いまの作業（直近の記録から作った短い文）。作業が終わったら消す
const activities = new Map<number, string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

subscribeServerEvent((e) => {
  if (e.type === "run_event") {
    const text = describeActivity(e.event);
    if (text && activities.get(e.event.run_id) !== text) {
      activities.set(e.event.run_id, text);
      notify();
    }
  } else if (e.type === "run" && e.run.status !== "running" && e.run.status !== "queued" && activities.delete(e.run.id)) {
    notify();
  }
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 作業中のチャットの、いまの作業（ファイルの編集・コマンドの実行など。まだ分からなければ null） */
export function useRunActivity(runId: number): string | null {
  return useSyncExternalStore(subscribe, () => activities.get(runId) ?? null);
}
