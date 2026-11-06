// チャットの文をメモにする（新しいメモを作る・AI で要約して新しいメモを作る・既存のメモに追記・既存のメモに AI で組み込んで書き直す）。
// 画面は移らず（続けてほかの文もメモできるように）、画面の下に様子を出す（MemoProgress。要約は数秒かかる）。
// 終わったら「開く」で、設定の開き方（右の欄 / 別ウィンドウ）でそのメモを開ける（openMemoFromChat）
import { useSyncExternalStore } from "react";
import { api } from "@/api";
import type { SettingValue } from "@/lib/storage";
import { MEMO_ADD_DEFAULT } from "@/lib/storageKeys";
import { memosStore } from "@/stores/memos";
import { reportFailure } from "@/ui/dialogs";
import { baseName } from "./memoPaths";
import { openMemoFromChat } from "./openMemoFrom";

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

/**
 * メモへの入れ方: new = 新しいメモを作る / summarize = AI で要約して新しいメモを作る /
 * append = 既存のメモの最後に足す / merge = 既存のメモに AI で組み込んで書き直す（メモ全体を書き換える）。
 * 一覧は、文を選んだときの「メモ」の既定の設定（MEMO_ADD_DEFAULT）の選択肢
 */
export type MemoAddMode = SettingValue<typeof MEMO_ADD_DEFAULT>;
export const MEMO_ADD_MODES: readonly MemoAddMode[] = MEMO_ADD_DEFAULT.choices;

/** 入れ方の名前（メニューの項目） */
export const MEMO_ADD_MODE_LABELS: Record<MemoAddMode, string> = {
  new: "新しいメモを作成",
  summarize: "AI で要約して新しいメモを作成",
  append: "既存のメモに追記",
  merge: "既存のメモに AI で組み込んで書き直す",
};

/** 既存のメモを選んでから足す入れ方か */
export const needsTargetMemo = (mode: MemoAddMode) => mode === "append" || mode === "merge";

/** 入れ方ごとの、している間と終わったあとの文 */
const MODE_TEXTS: Record<MemoAddMode, { busy: string; done: (name: string) => string; failed: string }> = {
  new: { busy: "新しいメモを作っています…", done: (name) => `「${name}」を作りました`, failed: "メモを作れませんでした" },
  summarize: { busy: "AI で要約して、新しいメモを作っています…", done: (name) => `「${name}」を作りました`, failed: "メモを作れませんでした" },
  append: { busy: "メモに追記しています…", done: (name) => `「${name}」に追記しました`, failed: "メモに追記できませんでした" },
  merge: { busy: "AI がメモに組み込んで書き直しています…", done: (name) => `「${name}」に AI で組み込んで書き直しました`, failed: "メモに組み込めませんでした" },
};

interface AddToMemoInput {
  projectId: number;
  chatId: number;
  text: string;
  mode: MemoAddMode;
  /** 足す・まとめる先のメモ（append / merge のとき。new / summarize は新しいメモ「<チャット名> チャットメモ<n>」） */
  target: string | null;
}

/** チャットの文をメモにする（失敗はお知らせで出す） */
export async function addToMemo({ projectId, chatId, text, mode, target }: AddToMemoInput): Promise<void> {
  const texts = MODE_TEXTS[mode];
  const existing = needsTargetMemo(mode);
  setProgress({ kind: "busy", text: texts.busy });
  try {
    const ref = await api.memoFromChat(projectId, {
      chat_id: chatId,
      text,
      summarize: mode === "summarize",
      merge: mode === "merge",
      append_to: existing ? target : null,
      folder: null,
    });
    memosStore.invalidate(projectId);
    setProgress({
      kind: "done",
      text: texts.done(baseName(ref.path)),
      open: () => {
        setProgress(null);
        openMemoFromChat({ projectId, path: ref.path, chatId });
      },
    });
  } catch (e) {
    setProgress(null);
    void reportFailure(texts.failed)(e);
  }
}
