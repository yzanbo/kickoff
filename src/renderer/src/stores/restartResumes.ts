// 起動したときの再開の確かめ（前回の終了で、作業の途中で止まった・自動で送るまま送信待ちが残ったチャット。答えるまでコアは続けず・送らない）。
// アプリを開いたときに 1 回読み、答えた・送信待ちが変わった・チャットを消したはサーバーの知らせで直す（確かめを待つチャットは起動したときにしかできない）
import type { BusEvent, RestartResume } from "@shared/types";
import { api } from "@/api";
import { createStore } from "./createStore";
import { useStore } from "./useStore";

const NONE: RestartResume[] = Object.freeze([]) as unknown as RestartResume[];

/**
 * 知らせで一覧を直す（答えた・聞くことがなくなった・チャットを消したら外し、送信待ちを聞かなくなったら送信待ちを外し、
 * 送信待ちが変わったら中身を直す。関係なければ同じ一覧）
 */
export function reduceRestartResumes(list: RestartResume[], event: BusEvent): RestartResume[] {
  if (event.type === "chat_deleted") return list.some((r) => r.chat_id === event.id) ? list.filter((r) => r.chat_id !== event.id) : list;
  if (event.type !== "chat_live") return list;
  const index = list.findIndex((r) => r.chat_id === event.chat_id);
  if (index < 0) return list;
  const { restart_resume: resume, queue } = event.live;
  const queued = resume !== null && resume.queued && queue.messages.length > 0;
  if (!resume || (!queued && !resume.interrupted)) return list.filter((r) => r.chat_id !== event.chat_id);
  const prev = list[index];
  const next = queued
    ? { interrupted: resume.interrupted, queued, messages: queue.messages, stops: queue.stops }
    : { interrupted: resume.interrupted, queued, messages: [], stops: [] };
  if (prev.interrupted === next.interrupted && prev.queued === next.queued && (queued ? prev.messages === queue.messages && prev.stops === queue.stops : prev.messages.length === 0)) return list;
  return list.map((r, i) => (i === index ? { ...r, ...next } : r));
}

/**
 * 確かめのダイアログを自動で開くか（窓ごと）。shown は前に見せた一覧のチャット。まだ見せていないチャットが届いたら開く
 * （起動のときと、コアのプロセスを作り直したあとに新しく止まったチャットが届いたとき。メモの仕様書「0026」の D7）。
 * 返す shown はいまの一覧のチャットだけにする（答えて一覧から外れたチャットが、あとでまた止まったときも開く）
 */
export function autoOpenRestartResumes(shown: ReadonlySet<number>, list: readonly RestartResume[]): { open: boolean; shown: ReadonlySet<number> } {
  return { open: list.some((r) => !shown.has(r.chat_id)), shown: new Set(list.map((r) => r.chat_id)) };
}

export const restartResumesStore = createStore<RestartResume[]>({ load: () => api.restartResumes(), reduce: reduceRestartResumes });

/** 起動したときの再開の確かめを待っているチャット（届くまでは空） */
export const useRestartResumes = (): RestartResume[] => useStore(restartResumesStore).data ?? NONE;
