// ノートの取り決め（受け口は src/features/notes/core/routes/notes.ts）。どれも端末（スマホ）にも開く。パスはノートのフォルダからの相対
import { raw, route, type Contract } from "@shared/foundation/contract";
import type { Chat, NoteAttachment } from "@shared/chat/types";
import type { FileContent, SavedFile } from "@shared/foundation/fileTypes";
import type { TrashedResult } from "@shared/trash/types";
import type { NoteAiPlanBody, NoteChatBody, NoteCreateBody, NoteFromChatBody, NoteMoveBody, NoteWriteBody } from "./api";
import type { NoteDefaults, NoteDirUsers, NoteList, NotePlan, NoteRef, NoteSearchResult } from "./types";

const device = { access: "device" } as const;
/** ノートを指すクエリ */
type PathQuery = { path: string };

export const notesContract = {
  /** 設定の画面で、親フォルダ・共通のノートのフォルダをまだ選んでいないときに出す既定の場所と、共通のノートのプロジェクト（使えなければ理由） */
  "GET /api/notes/defaults": route<never, NoteDefaults>(device),
  /** そのフォルダをノートのフォルダにしているプロジェクト（except は自分。ほかのプロジェクトと被っていると画面で知らせる） */
  "GET /api/notes/users": route<never, NoteDirUsers, { path: string; except?: number }>(device),
  /** すべてのプロジェクトのノートの中の文を探す（⌘K の「ノート内の文言」） */
  "GET /api/notes/search": route<never, NoteSearchResult, { q: string }>(device),
  /** フォルダとファイルの一覧（フォルダがまだなければ空） */
  "GET /api/projects/:projectId/notes": route<never, NoteList>(device),
  /** ノートの中身（なければ 404） */
  "GET /api/projects/:projectId/note": route<never, FileContent, PathQuery>(device),
  /** HTML のノートが相対パスで読むファイル（CSS・画像・フォント。画面は <base> をここに向ける） */
  "GET /api/projects/:projectId/note/file/*": raw(device),
  /** ノートを保存する（開いたときの指紋 base_hash といまの中身が違えば 409。null なら上書き） */
  "PUT /api/projects/:projectId/note": route<NoteWriteBody, SavedFile>(device),
  /** 新しいノート・フォルダ（同じ名前があれば 409。途中のフォルダも作る） */
  "POST /api/projects/:projectId/notes": route<NoteCreateBody, NoteRef>({ ...device, status: 201 }),
  /** 名前を変える・ほかのフォルダへ動かす（行き先に同じ名前があれば 409）。to_project_id でほかの欄へ（ノートのチャットごと。作業中なら 409） */
  "POST /api/projects/:projectId/notes/move": route<NoteMoveBody, NoteRef>(device),
  /** Kickoff のゴミ箱へ入れる（3 日は元に戻せる） */
  "DELETE /api/projects/:projectId/note": route<never, TrashedResult, PathQuery>(device),
  /** ノートの写しを添付として保存する（入力欄にノートを添付したとき） */
  "POST /api/projects/:projectId/note/snapshot": route<PathQuery, NoteAttachment>({ ...device, status: 201 }),
  /** ノートのチャットを始める（ノートごとに 1 つ。ノートがなければ 404、もうあれば 409。続きはふつうのチャットと同じ） */
  "POST /api/projects/:projectId/note/chat": route<NoteChatBody, Chat>({ ...device, status: 201 }),
  /** AI のフォルダの整理案（動かさない） */
  "POST /api/projects/:projectId/notes/ai-plan": route<NoteAiPlanBody, NotePlan>(device),
  /** チャットの文からノートを作る（201）・足す（200） */
  "POST /api/projects/:projectId/notes/from-chat": route<NoteFromChatBody, NoteRef>({ ...device, status: 201, alsoStatus: 200 }),
} as const satisfies Contract;
