// チャットを Kickoff のゴミ箱に入れる・戻す・本当に消す（メモの仕様書「ファイル削除」の Q11・Q13・Q15）。
// ゴミ箱にある間はチャットの行（会話の記録・会話記録のファイル・添付）を残し、ふだんの読み取りから外すだけ（store.chats.trash）。
// 3 日たって本当に消すとき、残ったチャットが使っていない会話記録のファイル・添付・AI の SQL の CSV も消す
import fs from "node:fs/promises";
import path from "node:path";
import { errorMessage } from "@shared/errors";
import { UNTITLED_CHAT_TITLE, type BusEvent, type Chat, type Project, type ProviderId } from "@shared/types";
import type { Store } from "../db/store.js";
import type { StoredTrashItem } from "../db/trash.js";
import type { AgentProvider } from "../providers/types.js";
import { collectChatSessions, discardUnusedSessions } from "../chat/sessionCleanup.js";
import type { UploadStore } from "../chat/uploads.js";
import { isInside, realPathLoose } from "../system/paths.js";
import type { TrashService } from "./service.js";

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
  /** AI の SQL の結果を書き出した CSV を消す */
  forgetChatExports?: (chatIds: number[]) => void;
}

/** 子孫も一緒にゴミ箱へ入れる（どれかが作業中なら 409）。入れたゴミ箱の行を返す */
export function trashChat(deps: ChatTrashDeps, chat: Chat, opts: { byChatId?: number | null } = {}): StoredTrashItem {
  const family = [chat, ...deps.store.chats.descendants(chat.id)];
  for (const c of family) deps.runner.requireIdle(c.id, "削除");
  const item = deps.trashBin.addRecord({
    project_id: chat.project_id,
    kind: "chat",
    label: chat.title || UNTITLED_CHAT_TITLE,
    chat_id: chat.id,
    by_chat_id: opts.byChatId ?? null,
    details: { chat_ids: family.map((c) => c.id) },
  });
  deps.store.chats.trash(
    family.map((c) => c.id),
    item.id,
  );
  for (const c of family) deps.runner.forget(c.id);
  return item;
}

/**
 * メモと一緒に、そのメモのチャット（フォルダならその中のメモのもの。子孫も）をゴミ箱の同じ行に入れる（一覧には 1 行で出る。作業中のものはそのまま）。
 * 入れたチャットの数を返す
 */
export function trashMemoChats(deps: Omit<ChatTrashDeps, "trashBin">, projectId: number, memoPath: string, itemId: string): number {
  const ids: number[] = [];
  for (const chat of deps.store.chats.memoChats(projectId, memoPath)) {
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
 * AI が kickoff-trash でメモ（メモのフォルダの中のもの）を消したとき、画面から消したときと同じく、メモのチャットも同じ行に入れ、
 * 覚え書きにメモのフォルダからのパスを足す（別の名前で戻したときに付け替えるため）。メモの一覧が変わったことも知らせる
 */
export function trashMemoChatsOnImport(
  deps: Omit<ChatTrashDeps, "trashBin"> & { memoDirOf: (project: Project) => string; publish: (e: BusEvent) => void },
  item: StoredTrashItem,
): void {
  const project = item.project_id !== null ? deps.store.projects.get(item.project_id) : null;
  if (!project || !item.origin || !(project.memo_path || project.memo_folder)) return;
  // kickoff-trash は元の場所をリンクを解いた形で書くので、メモのフォルダもリンクを解いて比べる
  const dir = realPathLoose(deps.memoDirOf(project));
  if (!isInside(dir, item.origin) || item.origin === dir) return;
  const memo = path.relative(dir, item.origin).split(path.sep).join("/");
  deps.store.trash.setDetails(item.id, { ...item.details, memo });
  trashMemoChats(deps, project.id, memo, item.id);
  deps.publish({ type: "memos", project_id: project.id, path: null });
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
  await discardUnusedSessions(deps.store, deps.providers, sessions, (file) => fs.rm(file, { recursive: true, force: true })).catch((e: unknown) =>
    console.warn(`[trash] 会話記録を消せませんでした: ${errorMessage(e)}`),
  );
  for (const id of uploadIds) {
    if (deps.store.events.uploadInUse(id) || !(await deps.uploads.resolve(id))) continue;
    await deps.uploads.remove(id).catch(() => {});
  }
  deps.forgetChatExports?.(ids);
}

/**
 * ゴミ箱にチャットの扱いを登録する（チャットの行・メモ・プロジェクトのどれから戻しても、一緒に入れたチャットを戻し、本当に消すときは一緒に消す）。
 * メモを別の名前で戻したら、メモのチャットの memo_path も付け替える
 */
export function registerChatTrash(trashBin: TrashService, deps: ChatPurgeDeps): void {
  const purge = (item: StoredTrashItem) => purgeChatsOf(deps, item.id);
  trashBin.register("chat", { restore: (item) => void restoreChatsOf(deps.store, item.id), purge });
  trashBin.register("file", {
    restore: (item, restoredPath) => {
      const restored = restoreChatsOf(deps.store, item.id);
      const memo = typeof item.details.memo === "string" ? item.details.memo : null;
      if (!memo || !item.origin || !restoredPath || restoredPath === item.origin || item.project_id === null || restored.length === 0) return;
      // 元の場所からメモのフォルダを割り出し、戻した名前で付け替える
      const memoDir = item.origin.slice(0, item.origin.length - memo.length).replace(/\/+$/, "");
      deps.store.chats.remapMemoPath(item.project_id, memo, path.relative(memoDir, restoredPath).split(path.sep).join("/"));
    },
    purge,
  });
}
