// チャットの一覧（全プロジェクトで 1 つ）。アーカイブしていないものは使い始めたときに 1 回読み、アーカイブ済みは頼まれたときだけ読む。
// どちらもサーバーの知らせ（chat / chat_deleted / project_deleted）で直し、並びはサーバーと同じく最後に動いた順。
// 部品は useChats({ projectId?, archived? }) で読む（そのプロジェクト・アーカイブ済みを含めるかの見え方ごとに、中身が同じなら同じ配列を返す）
import { useSyncExternalStore } from "react";
import type { BusEvent, Chat } from "@shared/types";
import { api } from "@/api";
import { createStore } from "./createStore";
import { useStoreStatus } from "./useStore";

/** 空の一覧（描くたびに作らない。書き換えない） */
export const NO_CHATS: Chat[] = Object.freeze([]) as unknown as Chat[];

/** 最後に動いた順（同じなら新しく作った順。サーバーの一覧と同じ並び。まとまりの中の並びもこれ） */
export const byActive = (a: Chat, b: Chat) => b.active_at.localeCompare(a.active_at) || b.id - a.id;

/** 届いたチャットを一覧に入れる（同じ ID は置き換え、最後に動いた順の位置へ） */
export function upsertChat(list: readonly Chat[], chat: Chat): Chat[] {
  const rest = list.filter((r) => r.id !== chat.id);
  const at = rest.findIndex((r) => byActive(chat, r) < 0);
  return at < 0 ? [...rest, chat] : [...rest.slice(0, at), chat, ...rest.slice(at)];
}

/** チャットを一覧から外す（なければ同じ一覧） */
function removeChat(list: Chat[], id: number): Chat[] {
  return list.some((r) => r.id === id) ? list.filter((r) => r.id !== id) : list;
}

/**
 * 知らせで一覧を直す（archived: アーカイブ済みの一覧か）。アーカイブした・戻したチャットは、もう一方の一覧へ移る。
 * 別のプロジェクトへ移したチャットは、プロジェクトの ID が変わって届く（プロジェクトごとの見え方からも外れる）
 */
export function reduceChats(list: Chat[], event: BusEvent, archived: boolean): Chat[] {
  switch (event.type) {
    case "chat":
      return Boolean(event.chat.archived_at) === archived ? upsertChat(list, event.chat) : removeChat(list, event.chat.id);
    case "chat_deleted":
      return removeChat(list, event.id);
    case "project_deleted":
      return list.some((r) => r.project_id === event.id) ? list.filter((r) => r.project_id !== event.id) : list;
    default:
      return list;
  }
}

const activeChats = createStore<Chat[]>({ load: () => api.allChats(), reduce: (list, e) => reduceChats(list, e, false) });
const archivedChats = createStore<Chat[]>({ load: () => api.allChats({ archived: true }), reduce: (list, e) => reduceChats(list, e, true) });

/**
 * 2 つの一覧から、そのプロジェクト（省けば全プロジェクト）のチャットを最後に動いた順に。子チャット（親のあるもの）とメモのチャットは入れない
 * （サイドバー・ボード・パネルのタブなどの一覧には並べず、子チャットは親の中（childChatsOf / useChildChats）、メモのチャットはそのメモの右の欄（useMemoChatOf）から開く）
 */
export function selectChats(active: readonly Chat[] | undefined, archived: readonly Chat[] | undefined, projectId?: number): Chat[] {
  const inProject = (r: Chat) => r.parent_chat_id === null && r.memo_path === null && (projectId === undefined || r.project_id === projectId);
  const list = [...(active ?? []).filter(inProject), ...(archived ?? []).filter(inProject)];
  if (archived?.length) list.sort(byActive);
  return list.length > 0 ? list : NO_CHATS;
}

/** 同じチャットが同じ順に並んでいるか（中身の変わらない見え方は、前の配列のまま返す） */
const sameItems = <T>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// 見え方（プロジェクト × アーカイブ済みを含めるか）ごとの、直前の結果
const views = new Map<string, { active: Chat[] | undefined; archived: Chat[] | undefined; chats: Chat[] }>();

function chatsView(projectId: number | undefined, archived: boolean): Chat[] {
  const key = `${projectId ?? "all"}:${archived ? "with-archived" : "active"}`;
  const active = activeChats.get().data;
  const old = archived ? archivedChats.get().data : undefined;
  const hit = views.get(key);
  if (hit && hit.active === active && hit.archived === old) return hit.chats;
  const next = selectChats(active, old, projectId);
  const chats = hit && sameItems(hit.chats, next) ? hit.chats : next;
  views.set(key, { active, archived: old, chats });
  return chats;
}

function subscribeChats(listener: () => void) {
  const a = activeChats.subscribe(listener);
  const b = archivedChats.subscribe(listener);
  return () => {
    a();
    b();
  };
}

export interface ChatQuery {
  /** そのプロジェクトのチャットだけ（省けば全プロジェクト） */
  projectId?: number;
  /** アーカイブ済みも含める（頼んだときに初めて読み込む） */
  archived?: boolean;
  /** false の間は読まずに、空の一覧を返す（サイドバーと連動しないパネルなど）。初めは true */
  enabled?: boolean;
}

export interface ChatList {
  /** 最後に動いた順（書き換えない） */
  chats: Chat[];
  /** 頼んだ一覧（アーカイブ済みを含めるならそれも）が届いたか */
  loaded: boolean;
  loading: boolean;
  error: string | undefined;
}

const NOT_LOADED: ChatList = { chats: NO_CHATS, loaded: false, loading: false, error: undefined };

/** チャットの一覧（サイドバー・ボード・パネル・⌘K・⌘⇧A などで共通。中身の変わらないプロジェクトの一覧は同じ配列のまま） */
export function useChats({ projectId, archived = false, enabled = true }: ChatQuery = {}): ChatList {
  const active = useStoreStatus(activeChats, { active: enabled });
  const old = useStoreStatus(archivedChats, { active: enabled && archived });
  // 読まない間は、一覧が変わっても描き直さない
  const chats = useSyncExternalStore(subscribeChats, () => (enabled ? chatsView(projectId, archived) : NO_CHATS));
  if (!enabled) return NOT_LOADED;
  return {
    chats,
    loaded: active.loaded && (!archived || old.loaded),
    loading: active.loading || (archived && old.loading),
    error: active.error ?? (archived ? old.error : undefined),
  };
}

/**
 * アーカイブしていないチャットの一覧から選んだ値（select の結果が変わったときだけ描き直す。結果は文字・数など、同じ中身なら === になるもの。
 * プロジェクトの最近動いた順など、一覧が変わっても結果が変わらないことの多いものを読むとき）。enabled でなければ読まず、undefined
 */
export function useChatsValue<T extends string | number>(select: (chats: Chat[]) => T, enabled = true): T | undefined {
  useStoreStatus(activeChats, { active: enabled });
  return useSyncExternalStore(subscribeChats, () => (enabled ? select(chatsView(undefined, false)) : undefined));
}

/** いまの一覧（部品の外・操作の途中で読むとき。読み込みは頼まない） */
export const currentChats = ({ projectId, archived = false }: Omit<ChatQuery, "enabled"> = {}): Chat[] => chatsView(projectId, archived);

/** ID のチャット（読み込んでいる一覧から。子チャット・アーカイブ済みも。部品の外で引くとき。なければ undefined） */
export const knownChat = (id: number): Chat | undefined => activeChats.get().data?.find((c) => c.id === id) ?? archivedChats.get().data?.find((c) => c.id === id);

/** ID のチャット（knownChat を部品から。変わったときだけ描き直す。右の欄の子チャットのタブの状態の印） */
export function useKnownChat(id: number): Chat | undefined {
  useStoreStatus(activeChats);
  return useSyncExternalStore(subscribeChats, () => knownChat(id));
}

/** プロジェクトごとのチャット（サイドバー。中身の変わらないプロジェクトの一覧は同じ配列のまま） */
export type ChatsByProject = Record<number, Chat[]>;

/** 一覧をプロジェクトごとに分ける（prev と中身の同じプロジェクトは、prev の配列を使う。どれも同じなら prev を返す） */
export function chatsByProject(chats: readonly Chat[], prev?: ChatsByProject): ChatsByProject {
  const next: ChatsByProject = {};
  for (const chat of chats) (next[chat.project_id] ??= []).push(chat);
  if (!prev) return next;
  let same = Object.keys(prev).length === Object.keys(next).length;
  for (const [id, list] of Object.entries(next)) {
    const before = prev[Number(id)];
    if (before && sameItems(before, list)) next[Number(id)] = before;
    else same = false;
  }
  return same ? prev : next;
}

const byProjectViews = new Map<boolean, { chats: Chat[]; byProject: ChatsByProject }>();

function byProjectView(archived: boolean): ChatsByProject {
  const chats = chatsView(undefined, archived);
  const hit = byProjectViews.get(archived);
  if (hit?.chats === chats) return hit.byProject;
  const byProject = chatsByProject(chats, hit?.byProject);
  byProjectViews.set(archived, { chats, byProject });
  return byProject;
}

/** 子チャットを親ごとに（親の ID → 子。最後に動いた順。アーカイブ済みは archived のときだけ） */
export function childChatsOf(active: readonly Chat[] | undefined, archived: readonly Chat[] | undefined): ReadonlyMap<number, Chat[]> {
  const map = new Map<number, Chat[]>();
  for (const chat of [...(active ?? []), ...(archived ?? [])]) {
    if (chat.parent_chat_id !== null) (map.get(chat.parent_chat_id) ?? map.set(chat.parent_chat_id, []).get(chat.parent_chat_id)!).push(chat);
  }
  if (archived?.length) for (const list of map.values()) list.sort(byActive);
  return map;
}

const childViews = new Map<boolean, { active: Chat[] | undefined; archived: Chat[] | undefined; map: ReadonlyMap<number, Chat[]> }>();

function childView(archived: boolean): ReadonlyMap<number, Chat[]> {
  const active = activeChats.get().data;
  const old = archived ? archivedChats.get().data : undefined;
  const hit = childViews.get(archived);
  if (hit && hit.active === active && hit.archived === old) return hit.map;
  const map = childChatsOf(active, old);
  childViews.set(archived, { active, archived: old, map });
  return map;
}

/** 子チャットを親ごとに（サイドバーの親の行の開閉・数、チャットの画面の札。archived: アーカイブ済みも含める） */
export function useChildChats({ archived = false }: { archived?: boolean } = {}): ReadonlyMap<number, Chat[]> {
  useStoreStatus(activeChats);
  useStoreStatus(archivedChats, { active: archived });
  return useSyncExternalStore(subscribeChats, () => childView(archived));
}

/** すべてのプロジェクトのチャットを、プロジェクトごとに（サイドバー。archived: アーカイブ済みも含める） */
export function useChatsByProject({ archived = false }: { archived?: boolean } = {}): ChatsByProject {
  useStoreStatus(activeChats);
  useStoreStatus(archivedChats, { active: archived });
  return useSyncExternalStore(subscribeChats, () => byProjectView(archived));
}

/** そのメモのチャット（アーカイブしていない、いちばん新しいもの。まだなければ undefined。一覧が届くまでも undefined） */
export function useMemoChatOf(projectId: number, memoPath: string): Chat | undefined {
  useStoreStatus(activeChats);
  return useSyncExternalStore(subscribeChats, () => memoChatIn(activeChats.get().data, projectId, memoPath));
}

const memoChatIn = (list: readonly Chat[] | undefined, projectId: number, memoPath: string): Chat | undefined => {
  let found: Chat | undefined;
  for (const chat of list ?? []) {
    if (chat.project_id === projectId && chat.memo_path === memoPath && !chat.archived_at && (!found || chat.id > found.id)) found = chat;
  }
  return found;
};
