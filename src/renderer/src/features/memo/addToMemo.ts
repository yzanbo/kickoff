// チャットの文をメモに追加する（新しいメモ・既存のメモへの追記。AI で要約してからも）。
// 画面は移らず（続けてほかの文もメモできるように）、画面の下に様子を出す（MemoProgress。要約は数秒かかる）。
// 終わったら「開く」でメモのタブのそのメモを開ける（別ウィンドウからなら、メインのウィンドウで）
import { useSyncExternalStore } from "react";
import { api } from "@/api";
import { openMemo } from "@/app/router";
import { parsePopout } from "@/app/popout";
import { postToMainWindow } from "@/app/windowBus";
import { memosStore } from "@/stores/memos";
import { reportFailure } from "@/ui/dialogs";
import { memoTitle } from "./memoPaths";

/** 終わった知らせを出しておく時間（ミリ秒） */
const DONE_SHOWN_MS = 6000;

/** 画面の下に出す様子（busy = 追加している / done = 追加した（開ける）） */
type MemoProgressState = { kind: "busy"; text: string } | { kind: "done"; text: string; open: () => void };

let progress: MemoProgressState | null = null;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const setProgress = (next: MemoProgressState | null) => {
  clearTimeout(hideTimer);
  progress = next;
  listeners.forEach((l) => l());
  if (next?.kind === "done") hideTimer = setTimeout(() => setProgress(null), DONE_SHOWN_MS);
};

/** 追加している様子（MemoProgress が読む） */
export function useMemoProgress(): MemoProgressState | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    () => progress,
  );
}

/** 知らせを閉じる */
export const dismissMemoProgress = () => setProgress(null);

/** メモのタブでそのメモを開く（別ウィンドウなら、メインのウィンドウで） */
function showMemo(projectId: number, path: string) {
  if (parsePopout(location.hash)) postToMainWindow({ type: "openMemo", projectId, path });
  else openMemo(projectId, path);
}

interface AddToMemoInput {
  projectId: number;
  chatId: number;
  text: string;
  /** AI で要約してから */
  summarize: boolean;
  /** 足す先のメモ（null なら新しいメモ「<チャット名> チャットメモ<n>」） */
  appendTo: string | null;
}

/** チャットの文をメモに追加する（失敗はお知らせで出す） */
export async function addToMemo({ projectId, chatId, text, summarize, appendTo }: AddToMemoInput): Promise<void> {
  setProgress({ kind: "busy", text: summarize ? "AI で要約して、メモに追加しています…" : "メモに追加しています…" });
  try {
    const ref = await api.memoFromChat(projectId, { chat_id: chatId, text, summarize, append_to: appendTo, folder: null });
    memosStore.invalidate(projectId);
    setProgress({
      kind: "done",
      text: appendTo ? `「${memoTitle(ref.path)}」に追記しました` : `「${memoTitle(ref.path)}」を作りました`,
      open: () => {
        setProgress(null);
        showMemo(projectId, ref.path);
      },
    });
  } catch (e) {
    setProgress(null);
    void reportFailure("メモに追加できませんでした")(e);
  }
}
