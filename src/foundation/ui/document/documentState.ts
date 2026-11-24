// 文書（開いて保存するもの）の様子の決め方。useDocument が使う純粋な部分

/** 文書の中身と指紋 */
export interface DocumentFile {
  content: string;
  hash: string;
}

/** まだ保存していない書きかけ（書いたものと、書き始めたときの指紋） */
export interface DocumentDraft {
  text: string;
  hash: string;
}

/**
 * 文書の様子（loading = 読み込み中 / saved = 保存済み / dirty = 書いた・まだ保存していない / saving = 保存中 /
 * conflict = ほかで変わっていて保存していない / error = 読み込み・保存の失敗）
 */
export type DocumentStatus = "loading" | "saved" | "dirty" | "saving" | "conflict" | "error";

/**
 * 読み込んだ中身から書き始める。書きかけが残っていれば戻す: 書き始めたときと指紋が同じなら dirty、違えば（ほかで変わった）conflict。
 * 書きかけがない・読み込んだ中身と同じなら saved（dropDraft: 残った書きかけを消す）
 */
export function startDocument(file: DocumentFile, draft: DocumentDraft | null): { text: string; status: "saved" | "dirty" | "conflict"; dropDraft: boolean } {
  if (draft && draft.text !== file.content) return { text: draft.text, status: draft.hash === file.hash ? "dirty" : "conflict", dropDraft: false };
  return { text: file.content, status: "saved", dropDraft: draft !== null };
}

/** 書いたあとの様子（conflict は選んでもらうまでそのまま。保存したものと同じに戻れば saved） */
export function statusAfterEdit(status: DocumentStatus, text: string, base: DocumentFile): DocumentStatus {
  if (status === "conflict") return status;
  return text === base.content ? "saved" : "dirty";
}

/**
 * ほかで変わったかもしれない中身が届いたとき: 指紋が同じなら何もしない（自分の保存も同じ指紋）。
 * 書きかけがなければ黙って読み直し、書きかけがあれば conflict にして選んでもらう
 */
export function freshAction(base: DocumentFile, text: string, fresh: DocumentFile): "none" | "reload" | "conflict" {
  if (fresh.hash === base.hash) return "none";
  return text === base.content ? "reload" : "conflict";
}

/** 残す書きかけ（保存したものと同じなら null = 消す） */
export function draftOf(text: string, base: DocumentFile): DocumentDraft | null {
  return text === base.content ? null : { text, hash: base.hash };
}
