// 画面のタブの中身のうち、部品だけが知っているもの（エディタのカーソルと選んでいる範囲・ノートで選んでいる文）を、
// 利用者が見ているものの知らせ（report.ts。AI の get_user_view）が読むための置き場。開いている部品（files・notes）が置き、閉じたら外す
import type { UserViewSelection } from "@shared/userView/types";
import { createRegistry } from "@/foundation/ui/store";

/** エディタのカーソルの行と選んでいる範囲（選んでいなければ null） */
export interface EditorCursor {
  line: number;
  selection: UserViewSelection | null;
}

const editors = createRegistry<string, () => EditorCursor | null>();
const notes = createRegistry<string, () => string>();

const editorKey = (projectId: number, path: string) => `${projectId}:${path}`;

/** 開いているエディタのカーソルを読む口を置く（同じファイルをいくつも開いていれば、最後に置いたもの。返した関数で外す） */
export const registerEditorCursor = (projectId: number, path: string, read: () => EditorCursor | null): (() => void) => editors.set(editorKey(projectId, path), read);

/** そのファイルのエディタのカーソル（開いていなければ null） */
export const editorCursorOf = (projectId: number, path: string): EditorCursor | null => editors.get(editorKey(projectId, path))?.() ?? null;

/** 開いているノートの選んでいる文を読む口を置く（返した関数で外す） */
export const registerNoteSelection = (projectId: number, path: string, read: () => string): (() => void) => notes.set(editorKey(projectId, path), read);

/** そのノートで選んでいる文（選んでいない・開いていなければ null） */
export const noteSelectionOf = (projectId: number, path: string): string | null => notes.get(editorKey(projectId, path))?.() || null;
