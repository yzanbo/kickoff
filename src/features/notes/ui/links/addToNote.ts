// チャットの文をノートにする（新しいノートを作る・AI で要約して新しいノートを作る・既存のノートに追記・既存のノートに AI で組み込んで書き直す）。
// 画面は移らず（続けてほかの文もノートできるように）、画面の下に進行中の知らせを出す（要約は数秒かかる）。
// 終わったら知らせの「開く」で、設定の開き方（右の欄 / 別ウィンドウ）でそのノートを開ける（openNoteFromChat）
import { baseName } from "@shared/foundation/path";
import { notesApi } from "@/features/notes/ui/api";
import { notesStore } from "@/features/notes/ui/store";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { showProgressToast } from "@/foundation/ui/kit/toast";
import { openNoteFromChat } from "@/features/notes/ui/openNoteFrom";

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
  const progress = showProgressToast(texts.busy);
  try {
    const ref = await notesApi("POST /api/projects/:projectId/notes/from-chat", { params: { projectId }, body: {
      chat_id: chatId,
      text,
      summarize: mode === "summarize",
      merge: mode === "merge",
      append_to: existing ? target : null,
      folder: null,
    } });
    notesStore.invalidate(projectId);
    progress.done(texts.done(baseName(ref.path)), { label: "開く", run: () => openNoteFromChat({ projectId, path: ref.path, chatId }) });
  } catch (e) {
    progress.fail(texts.failed);
    void reportFailure(texts.failed)(e);
  }
}
