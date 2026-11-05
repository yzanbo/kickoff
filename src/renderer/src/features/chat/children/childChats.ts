// 子チャット（チャットの寄り道の質問を、親に紐づいた別のチャットで聞く）の開き方・聞く画面の開き方・親へ渡す文
import { useSyncExternalStore } from "react";
import type { Chat } from "@shared/types";
import { canPopout, openPopout } from "@/app/popout";
import { openChat } from "@/app/router";
import { chatTitle } from "@/features/chat/chatTitle";

/**
 * 子チャットを開く（Mac のアプリなら別ウィンドウ。もう開いていれば前に出す。別ウィンドウを開けないスマホのブラウザなどでは、
 * ふつうのチャットと同じくプロジェクトのチャットのパネルで開く）
 */
export function openChildChat(chat: Pick<Chat, "id" | "project_id" | "title">) {
  if (canPopout()) openPopout({ kind: "chat", chatId: chat.id }, `${chatTitle(chat.title)} — 子チャット`);
  else openChat(chat.project_id, chat.id);
}

/** 聞く画面に渡すもの（どのチャットの、どの記録から、どの文を） */
export interface AskChildRequest {
  parentId: number;
  eventId: number | null;
  quote: string;
}

let request: AskChildRequest | null = null;
const listeners = new Set<() => void>();
const set = (next: AskChildRequest | null) => {
  request = next;
  listeners.forEach((l) => l());
};

/** 「子チャットで聞く」の画面を開く（AskChildHost が出す） */
export const openAskChild = (next: AskChildRequest) => set(next);
export const closeAskChild = () => set(null);

/** 開いている「子チャットで聞く」の画面（なければ null） */
export function useAskChildRequest(): AskChildRequest | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    () => request,
  );
}

/** 子チャットの答えを親の入力欄に入れる文（どの子チャットの答えかを添えた引用） */
export function handBackText(child: Pick<Chat, "title">, answer: string): string {
  const quoted = answer
    .trim()
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
  return `子チャット「${chatTitle(child.title)}」の答え:\n${quoted}\n\n`;
}
