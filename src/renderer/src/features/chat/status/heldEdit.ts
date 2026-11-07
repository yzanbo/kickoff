import { useSyncExternalStore } from "react";
import type { Attachment } from "@shared/types";

/** 入力欄で書き直している預かった指示（チャットごとに 1 つ。画面の中だけで持ち、保存しない） */
export interface HeldEdit {
  /** 預かった指示の ID */
  id: string;
  /** 送る順番（1 から。帯に「n 件目」と出す） */
  position: number;
  /** 書き直しを始めたときの文と添付（入力欄に入れる） */
  text: string;
  attachments: Attachment[];
}

const edits = new Map<number, HeldEdit>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** 預かった指示の書き直しを始める（吹き出しの鉛筆。チャット欄が書き直しの欄に入れ替わる） */
export function startHeldEdit(chatId: number, edit: HeldEdit) {
  edits.set(chatId, edit);
  notify();
}

/** 書き直しを終える（保存した・やめた） */
export function endHeldEdit(chatId: number) {
  if (!edits.delete(chatId)) return;
  notify();
}

/** そのチャットで書き直している預かった指示（なければ null） */
export function useHeldEdit(chatId: number): HeldEdit | null {
  return useSyncExternalStore(subscribe, () => edits.get(chatId) ?? null);
}
