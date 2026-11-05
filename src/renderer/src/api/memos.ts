import type { FileContent, MemoAiEditBody, MemoAiEditResult, MemoDefaults, MemoFromChatBody, MemoList, MemoPlan, MemoRef, SavedFile } from "@shared/types";
import { request, withQuery } from "./http";

/** プロジェクトのメモ（保存先はプロジェクトの外。パスはメモのフォルダからの相対。コアの routes/memos.ts） */
export const memosApi = {
  memoDefaults: () => request<MemoDefaults>("GET", "/api/memos/defaults"),
  memos: (projectId: number) => request<MemoList>("GET", `/api/projects/${projectId}/memos`),
  memo: (projectId: number, path: string) => request<FileContent>("GET", withQuery(`/api/projects/${projectId}/memo`, { path })),
  /** メモを保存する（baseHash は開いたときの指紋。ほかで変わっていれば 409。null なら上書き） */
  saveMemo: (projectId: number, path: string, content: string, baseHash: string | null) =>
    request<SavedFile>("PUT", `/api/projects/${projectId}/memo`, { path, content, base_hash: baseHash }),
  /** 新しいメモ・フォルダ（同じ名前があれば 409） */
  createMemo: (projectId: number, path: string, opts: { dir?: boolean; content?: string } = {}) =>
    request<MemoRef>("POST", `/api/projects/${projectId}/memos`, { path, ...opts }),
  moveMemo: (projectId: number, from: string, to: string) => request<MemoRef>("POST", `/api/projects/${projectId}/memos/move`, { from, to }),
  /** ゴミ箱へ移す */
  trashMemo: (projectId: number, path: string) => request<void>("DELETE", withQuery(`/api/projects/${projectId}/memo`, { path })),
  /** チャットの文からメモを作る・足す（summarize なら AI で要約してから） */
  memoFromChat: (projectId: number, body: MemoFromChatBody) => request<MemoRef>("POST", `/api/projects/${projectId}/memos/from-chat`, body),
  /** AI で直した文（メモ全体か、part なら選んだ部分。保存はしない） */
  aiEditMemo: (projectId: number, body: MemoAiEditBody) => request<MemoAiEditResult>("POST", `/api/projects/${projectId}/memo/ai`, body),
  /** AI のメモのフォルダの整理案（動かしはしない。instruction が null ならおまかせ） */
  aiPlanMemos: (projectId: number, instruction: string | null) => request<MemoPlan>("POST", `/api/projects/${projectId}/memos/ai-plan`, { instruction }),
};
