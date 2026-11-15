// 起動したときの送信待ちの確かめ（前回の終了で、自動で送るまま送信待ちが残ったチャット。答えるまでコアは送らない）。
// アプリを開いたときに 1 回読み、答えた・送信待ちが変わった・チャットを消したはサーバーの知らせで直す（確かめを待つチャットは起動したときにしかできない）
import type { BusEvent, RestartResume } from "@shared/types";
import { api } from "@/api";
import { createStore } from "./createStore";
import { useStore } from "./useStore";

const NONE: RestartResume[] = Object.freeze([]) as unknown as RestartResume[];

/** 知らせで一覧を直す（答えた・送信待ちが空になった・チャットを消したら外し、送信待ちが変わったら中身を直す。関係なければ同じ一覧） */
export function reduceRestartResumes(list: RestartResume[], event: BusEvent): RestartResume[] {
  if (event.type === "chat_deleted") return list.some((r) => r.chat_id === event.id) ? list.filter((r) => r.chat_id !== event.id) : list;
  if (event.type !== "chat_live") return list;
  const index = list.findIndex((r) => r.chat_id === event.chat_id);
  if (index < 0) return list;
  const { restart_resume: resume, queue } = event.live;
  if (!resume || queue.messages.length === 0) return list.filter((r) => r.chat_id !== event.chat_id);
  const prev = list[index];
  if (prev.messages === queue.messages && prev.stops === queue.stops) return list;
  return list.map((r, i) => (i === index ? { ...r, messages: queue.messages, stops: queue.stops } : r));
}

export const restartResumesStore = createStore<RestartResume[]>({ load: () => api.restartResumes(), reduce: reduceRestartResumes });

/** 起動したときの送信待ちの確かめを待っているチャット（届くまでは空） */
export const useRestartResumes = (): RestartResume[] => useStore(restartResumesStore).data ?? NONE;
