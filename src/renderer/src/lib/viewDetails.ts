// 画面のタブの中身のうち、部品だけが知っているもの（エディタのカーソルと選んでいる範囲・メモで選んでいる文）を、
// 利用者が見ているものの知らせ（app/userViewReport.ts。AI の get_user_view）が読むための置き場。開いている部品が置き、閉じたら外す
import type { UserViewSelection } from "@shared/types";

/** エディタのカーソルの行と選んでいる範囲（選んでいなければ null） */
export interface EditorCursor {
  line: number;
  selection: UserViewSelection | null;
}

const editors = new Map<string, () => EditorCursor | null>();
const memos = new Map<string, () => string>();

const editorKey = (projectId: number, path: string) => `${projectId}:${path}`;

/** 開いているエディタのカーソルを読む口を置く（同じファイルをいくつも開いていれば、最後に置いたもの。返した関数で外す） */
export function registerEditorCursor(projectId: number, path: string, read: () => EditorCursor | null): () => void {
  const key = editorKey(projectId, path);
  editors.set(key, read);
  return () => {
    if (editors.get(key) === read) editors.delete(key);
  };
}

/** そのファイルのエディタのカーソル（開いていなければ null） */
export const editorCursorOf = (projectId: number, path: string): EditorCursor | null => editors.get(editorKey(projectId, path))?.() ?? null;

/** 開いているメモの選んでいる文を読む口を置く（返した関数で外す） */
export function registerMemoSelection(projectId: number, path: string, read: () => string): () => void {
  const key = editorKey(projectId, path);
  memos.set(key, read);
  return () => {
    if (memos.get(key) === read) memos.delete(key);
  };
}

/** そのメモで選んでいる文（選んでいない・開いていなければ null） */
export const memoSelectionOf = (projectId: number, path: string): string | null => memos.get(editorKey(projectId, path))?.() || null;
