// ノートとノートのチャットの行き来（notes が呼ぶ口。chat はノートのフォルダを知らないので、場所は notes が渡す）
import type { Project } from "@shared/projects/types";
import type { BusEvent } from "@shared/foundation/contract";
import type { ChatStoreDeps } from "./stores";
import { trashNoteChats, trashNoteChatsOnImport, type ChatTrashDeps } from "./sessions/chatTrash";

/** ゴミ箱の行（trash の店の行） */
type TrashItem = Parameters<typeof trashNoteChatsOnImport>[1];

export interface NoteChatLink {
  /** ノートを動かした（フォルダなら中のノートのものも）: ノートのチャットの note_path を付け替える */
  moved(projectId: number, from: string, to: string): void;
  /** ノートをゴミ箱へ入れた: ノートのチャットも同じ行に入れる（作業中のものはそのまま） */
  trashed(projectId: number, path: string, itemId: string): void;
  /**
   * AI の kickoff-trash でノートのフォルダの中のものが入った: 画面から入れたときと同じくノートのチャットも入れ、一覧が変わったと知らせる。
   * 入ったノート（かフォルダ）のプロジェクトとパスを返す（ノートのフォルダの外なら null。ノートの機能がほかの付け替えに使う）
   */
  imported(item: TrashItem, noteDirOf: (project: Project) => string): { projectId: number; path: string } | null;
  /** そのノートのチャット（アーカイブしていないもの）があるか */
  hasChat(projectId: number, path: string): boolean;
}

export function createNoteChatLink(deps: Omit<ChatTrashDeps, "trashBin"> & { store: Pick<ChatStoreDeps, "chats">; publish: (e: BusEvent) => void }): NoteChatLink {
  return {
    moved: (projectId, from, to) => deps.store.chats.remapNotePath(projectId, from, to),
    trashed: (projectId, path, itemId) => void trashNoteChats(deps, projectId, path, itemId),
    imported: (item, noteDirOf) => trashNoteChatsOnImport({ ...deps, noteDirOf }, item),
    hasChat: (projectId, path) => deps.store.chats.noteChats(projectId, path).some((chat) => chat.note_path === path && !chat.archived_at),
  };
}
