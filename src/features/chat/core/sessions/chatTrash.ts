// チャットを Kickoff のゴミ箱に入れる・戻す・本当に消す。
// ゴミ箱にある間はチャットの行（会話の記録・会話記録のファイル・添付）を残し、ふだんの読み取りから外すだけ（store.chats.trash）。
// 3 日たって本当に消すとき、残ったチャットが使っていない会話記録のファイル・添付・AI の SQL の CSV も消す
import fs from "node:fs/promises";
import path from "node:path";
import { errorMessage } from "@shared/foundation/errors";
import { UNTITLED_CHAT_TITLE, type Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import type { ProviderId } from "@shared/settings/types";
import type { BusEvent } from "@shared/foundation/contract";
import type { Store } from "@/features/chat/core/stores";
import type { StoredTrashItem } from "@/features/trash/core/db/trash";
import type { AgentProvider } from "@/features/ai/core/providers/types";
import { collectChatSessions, discardUnusedSessions } from "./sessionCleanup";
import type { UploadStore } from "@/features/attachments/core/uploads";
import { tx } from "@/foundation/core/db/tx";
import { isInside, realPathLoose } from "@/foundation/core/system/paths";
import type { TrashService } from "@/features/trash/core/service";

/** チャットをゴミ箱に入れるときに使うもの（作業中か確かめる・作業中の状態を捨てる） */
export interface ChatTrashDeps {
  store: Store;
  trashBin: Pick<TrashService, "addRecord">;
  runner: { requireIdle(chatId: number, action: string): void; forget(chatId: number): void };
}

/** 本当に消すときに使うもの */
export interface ChatPurgeDeps {
  store: Store;
  providers: Record<ProviderId, AgentProvider>;
  uploads: Pick<UploadStore, "resolve" | "remove">;
  /** 上の機能の後片付け（AI の SQL の結果を書き出した CSV・チャット欄の外の画像の覚え。chat の onChatsPurged に登録したもの） */
  onPurged?: (chatIds: number[]) => Promise<void>;
  /** ほかの Kickoff（製品版と開発版）のチャットが使っているセッション（その会話記録は消さない。siblingSessions.ts） */
  sessionsElsewhere?: (ids: string[]) => Set<string>;
}

/** 子孫も一緒にゴミ箱へ入れる（どれかが作業中なら 409）。入れたゴミ箱の行を返す */
export function trashChat(deps: ChatTrashDeps, chat: Chat, opts: { byChatId?: number | null } = {}): StoredTrashItem {
  const family = [chat, ...deps.store.chats.descendants(chat.id)];
  for (const c of family) deps.runner.requireIdle(c.id, "削除");
  // 行を足して隠すまでを 1 つに（間で失敗すると、中身のないゴミ箱の行が残るため）
  const item = tx(deps.store.db, () => {
    const added = deps.trashBin.addRecord({
      project_id: chat.project_id,
      kind: "chat",
      label: chat.title || UNTITLED_CHAT_TITLE,
      chat_id: chat.id,
      by_chat_id: opts.byChatId ?? null,
      details: { chat_ids: family.map((c) => c.id) },
    });
    deps.store.chats.trash(
      family.map((c) => c.id),
      added.id,
    );
    return added;
  });
  for (const c of family) deps.runner.forget(c.id);
  return item;
}

/**
 * ノートと一緒に、そのノートのチャット（フォルダならその中のノートのもの。子孫も）をゴミ箱の同じ行に入れる（一覧には 1 行で出る。作業中のものはそのまま）。
 * 入れたチャットの数を返す
 */
export function trashNoteChats(deps: Omit<ChatTrashDeps, "trashBin">, projectId: number, notePath: string, itemId: string): number {
  const ids: number[] = [];
  for (const chat of deps.store.chats.noteChats(projectId, notePath)) {
    const family = [chat, ...deps.store.chats.descendants(chat.id)];
    if (family.some((c) => c.status === "running")) continue;
    ids.push(...family.map((c) => c.id));
  }
  if (ids.length === 0) return 0;
  deps.store.chats.trash(ids, itemId);
  for (const id of ids) deps.runner.forget(id);
  return ids.length;
}

/**
 * AI が kickoff-trash でノート（ノートのフォルダの中のもの）を消したとき、画面から消したときと同じく、ノートのチャットも同じ行に入れ、
 * 覚え書きにノートのフォルダからのパスを足す（別の名前で戻したときに付け替えるため）。ノートの一覧が変わったことも知らせる
 */
export function trashNoteChatsOnImport(
  deps: Omit<ChatTrashDeps, "trashBin"> & { noteDirOf: (project: Project) => string; publish: (e: BusEvent) => void },
  item: StoredTrashItem,
): void {
  const project = item.project_id !== null ? deps.store.projects.get(item.project_id) : null;
  if (!project || !item.origin || !(project.note_dir || project.note_folder)) return;
  // kickoff-trash は元の場所をリンクを解いた形で書くので、ノートのフォルダもリンクを解いて比べる
  const dir = realPathLoose(deps.noteDirOf(project));
  if (!isInside(dir, item.origin) || item.origin === dir) return;
  const note = path.relative(dir, item.origin).split(path.sep).join("/");
  deps.store.trash.setDetails(item.id, { ...item.details, note });
  trashNoteChats(deps, project.id, note, item.id);
  deps.publish({ type: "notes", project_id: project.id, path: null });
}

/** ゴミ箱の行と一緒に入れたチャットを戻す（親がもう消えたものは親のないチャットに） */
export function restoreChatsOf(store: Store, itemId: string): Chat[] {
  return store.chats.untrash(itemId);
}

/**
 * ゴミ箱の行と一緒に入れたチャットを本当に消す。記録が消える前に会話記録のファイルと添付の候補を集め、行を消したあとで、
 * 残ったチャットが使っていないものだけを消す（ゴミ箱を通さない。失敗しても止めず、記録に残すだけ）
 */
export async function purgeChatsOf(deps: ChatPurgeDeps, itemId: string): Promise<void> {
  const chats = deps.store.chats.trashedWith(itemId);
  if (chats.length === 0) return;
  const ids = chats.map((c) => c.id);
  const sessions = collectChatSessions(deps.store, chats);
  const uploadIds = deps.store.events.uploadIdsIn(ids);
  deps.store.chats.purgeTrashed(itemId);
  await discardUnusedSessions(deps.store, deps.providers, sessions, (file) => fs.rm(file, { recursive: true, force: true }), deps.sessionsElsewhere).catch((e: unknown) =>
    console.warn(`[trash] 会話記録を消せませんでした: ${errorMessage(e)}`),
  );
  for (const id of uploadIds) {
    if (deps.store.events.uploadInUse(id) || !(await deps.uploads.resolve(id))) continue;
    await deps.uploads.remove(id).catch(() => {});
  }
  await deps.onPurged?.(ids).catch(() => {});
}

/**
 * ゴミ箱にチャットの扱いを登録する（チャットの行・ノート・プロジェクトのどれから戻しても、一緒に入れたチャットを戻し、本当に消すときは一緒に消す）。
 * ノートを別の名前で戻したら、ノートのチャットの note_path も付け替える
 */
export function registerChatTrash(trashBin: TrashService, deps: ChatPurgeDeps): void {
  const purge = (item: StoredTrashItem) => purgeChatsOf(deps, item.id);
  trashBin.register("chat", { restore: (item) => void restoreChatsOf(deps.store, item.id), purge });
  trashBin.register("file", {
    restore: (item, restoredPath) => {
      const restored = restoreChatsOf(deps.store, item.id);
      const note = typeof item.details.note === "string" ? item.details.note : null;
      if (!note || !item.origin || !restoredPath || restoredPath === item.origin || item.project_id === null || restored.length === 0) return;
      // 元の場所からノートのフォルダを割り出し、戻した名前で付け替える
      const noteDir = item.origin.slice(0, item.origin.length - note.length).replace(/\/+$/, "");
      deps.store.chats.remapNotePath(item.project_id, note, path.relative(noteDir, restoredPath).split(path.sep).join("/"));
    },
    purge,
  });
}
