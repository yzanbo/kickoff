// チャットの文をノートにする（新しいノートを作る・AI で要約して新しいノートを作る・既存のノートに追記・既存のノートに AI で組み込んで書き直す）。
// 画面は移らず（続けてほかの文もノートできるように）、画面の下に様子を出す（NoteProgress。要約は数秒かかる）。
// 終わったら「開く」で、設定の開き方（右の欄 / 別ウィンドウ）でそのノートを開ける（openNoteFromChat）
import { useSyncExternalStore } from "react";
import { api } from "@/foundation/ui/api";
import { notesStore } from "@/features/notes/ui/stores/notes";
import { reportFailure } from "@/foundation/ui/kit/dialogs";
import { baseName } from "./notePaths";
import { openNoteFromChat } from "./openNoteFrom";

/** 終わった知らせを出しておく時間（ミリ秒） */
const DONE_SHOWN_MS = 6000;

/** 画面の下に出す様子（busy = 追加している / done = 追加した（開ける）） */
type NoteProgressState = { kind: "busy"; text: string } | { kind: "done"; text: string; open: () => void };

let progress: NoteProgressState | null = null;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const setProgress = (next: NoteProgressState | null) => {
  clearTimeout(hideTimer);
  progress = next;
  listeners.forEach((l) => l());
  if (next?.kind === "done") hideTimer = setTimeout(() => setProgress(null), DONE_SHOWN_MS);
};

/** 追加している様子（NoteProgress が読む） */
export function useNoteProgress(): NoteProgressState | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    () => progress,
  );
}

/** 知らせを閉じる */
export const dismissNoteProgress = () => setProgress(null);

/**
 * ノートへの入れ方: new = 選択部分をそのまま新しいノートにする / summarize = AI で要約して新しいノートにする /
 * append = 既存のノートの最後に足す / merge = 既存のノートに AI で組み込んで書き直す（ノート全体を書き換える）
 */
const NOTE_ADD_MODES = ["new", "summarize", "append", "merge"] as const;
export type NoteAddMode = (typeof NOTE_ADD_MODES)[number];

/** 入れ方の名前（メニューの項目。新しいノート / 既存のノート の見出しの下に並べるので、どちらのノートかは見出しで伝える） */
export const NOTE_ADD_MODE_LABELS: Record<NoteAddMode, string> = {
  new: "そのままノートにする",
  summarize: "AI で要約してノートにする",
  append: "追記する",
  merge: "AI で組み込んで書き直す",
};

/** 既存のノートを選んでから足す入れ方か */
const needsTargetNote = (mode: NoteAddMode) => mode === "append" || mode === "merge";

/** 入れ方ごとの、している間と終わったあとの文 */
const MODE_TEXTS: Record<NoteAddMode, { busy: string; done: (name: string) => string; failed: string }> = {
  new: { busy: "新しいノートを作っています…", done: (name) => `「${name}」を作りました`, failed: "ノートを作れませんでした" },
  summarize: { busy: "AI で要約して、新しいノートを作っています…", done: (name) => `「${name}」を作りました`, failed: "ノートを作れませんでした" },
  append: { busy: "ノートに追記しています…", done: (name) => `「${name}」に追記しました`, failed: "ノートに追記できませんでした" },
  merge: { busy: "AI がノートに組み込んで書き直しています…", done: (name) => `「${name}」に AI で組み込んで書き直しました`, failed: "ノートに組み込めませんでした" },
};

interface AddToNoteInput {
  projectId: number;
  chatId: number;
  text: string;
  mode: NoteAddMode;
  /** 足す・まとめる先のノート（append / merge のとき。new / summarize は新しいノート「<チャット名> チャットノート<n>」） */
  target: string | null;
}

/** チャットの文をノートにする（失敗はお知らせで出す） */
export async function addToNote({ projectId, chatId, text, mode, target }: AddToNoteInput): Promise<void> {
  const texts = MODE_TEXTS[mode];
  const existing = needsTargetNote(mode);
  setProgress({ kind: "busy", text: texts.busy });
  try {
    const ref = await api.noteFromChat(projectId, {
      chat_id: chatId,
      text,
      summarize: mode === "summarize",
      merge: mode === "merge",
      append_to: existing ? target : null,
      folder: null,
    });
    notesStore.invalidate(projectId);
    setProgress({
      kind: "done",
      text: texts.done(baseName(ref.path)),
      open: () => {
        setProgress(null);
        openNoteFromChat({ projectId, path: ref.path, chatId });
      },
    });
  } catch (e) {
    setProgress(null);
    void reportFailure(texts.failed)(e);
  }
}
