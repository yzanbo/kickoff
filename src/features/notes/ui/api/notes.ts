import type { Chat, NoteAttachment } from "@shared/chat/types";
import type { NoteChatBody, NoteFromChatBody } from "@shared/notes/api";
import type { FileContent, SavedFile } from "@shared/foundation/fileTypes";
import type { NoteDefaults, NoteDirUsers, NoteList, NotePlan, NoteRef, NoteSearchResult } from "@shared/notes/types";
import type { TrashedResult } from "@shared/trash/types";
import { request, withQuery } from "@/foundation/ui/api/http";

/** プロジェクトのノート（保存先はプロジェクトの外。パスはノートのフォルダからの相対。コアの routes/notes.ts） */
export const notesApi = {
  noteDefaults: () => request<NoteDefaults>("GET", "/api/notes/defaults"),
  /** そのフォルダをノートのフォルダにしているプロジェクト（except は自分） */
  noteDirUsers: (path: string, except?: number) => request<NoteDirUsers>("GET", withQuery("/api/notes/users", { path, except })),
  /** すべてのプロジェクトのノートの中の文を探す（⌘K の「ノート内の文言」） */
  searchNotes: (q: string) => request<NoteSearchResult>("GET", withQuery("/api/notes/search", { q })),
  notes: (projectId: number) => request<NoteList>("GET", `/api/projects/${projectId}/notes`),
  note: (projectId: number, path: string) => request<FileContent>("GET", withQuery(`/api/projects/${projectId}/note`, { path })),
  /** ノートの写しを添付にする（入力欄にノートを添付したとき。付けたときの中身を送る） */
  noteSnapshot: (projectId: number, path: string) => request<NoteAttachment>("POST", `/api/projects/${projectId}/note/snapshot`, { path }),
  /** ノートを保存する（baseHash は開いたときの指紋。ほかで変わっていれば 409。null なら上書き） */
  saveNote: (projectId: number, path: string, content: string, baseHash: string | null) =>
    request<SavedFile>("PUT", `/api/projects/${projectId}/note`, { path, content, base_hash: baseHash }),
  /** 新しいノート・フォルダ（同じ名前があれば 409） */
  createNote: (projectId: number, path: string, opts: { dir?: boolean; content?: string } = {}) =>
    request<NoteRef>("POST", `/api/projects/${projectId}/notes`, { path, ...opts }),
  moveNote: (projectId: number, from: string, to: string) => request<NoteRef>("POST", `/api/projects/${projectId}/notes/move`, { from, to }),
  /** ゴミ箱へ移す */
  trashNote: (projectId: number, path: string) => request<TrashedResult>("DELETE", withQuery(`/api/projects/${projectId}/note`, { path })),
  /** チャットの文からノートを作る・足す（summarize なら AI で要約してから） */
  noteFromChat: (projectId: number, body: NoteFromChatBody) => request<NoteRef>("POST", `/api/projects/${projectId}/notes/from-chat`, body),
  /** ノートのチャットを始める（最初の指示。ノートごとに 1 つ。続きはふつうのチャットと同じく sendMessage） */
  startNoteChat: (projectId: number, body: NoteChatBody) => request<Chat>("POST", `/api/projects/${projectId}/note/chat`, body),
  /** AI のノートのフォルダの整理案（動かしはしない。instruction が null ならおまかせ） */
  aiPlanNotes: (projectId: number, instruction: string | null) => request<NotePlan>("POST", `/api/projects/${projectId}/notes/ai-plan`, { instruction }),
};
