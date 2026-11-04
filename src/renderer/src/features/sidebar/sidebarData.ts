import type { Chat, ChatGroup } from "@shared/types";

/** プロジェクトごとのチャット・グループ（useSidebarData が持つ形） */
export type ChatsByProject = Record<number, Chat[]>;
export type GroupsByProject = Record<number, ChatGroup[]>;

const byPosition = (a: ChatGroup, b: ChatGroup) => a.position - b.position || a.id - b.id;
const byActive = (a: Chat, b: Chat) => b.active_at.localeCompare(a.active_at);

/** サーバーから届いたチャットを、そのプロジェクトの一覧に入れる（同じ ID は置き換え、新しく動いた順に並べ直す） */
export function upsertChat(prev: ChatsByProject, chat: Chat): ChatsByProject {
  const list = prev[chat.project_id] ?? [];
  const next = { ...prev, [chat.project_id]: [chat, ...list.filter((r) => r.id !== chat.id)].sort(byActive) };
  // ほかのプロジェクトへ移したチャットは、元のプロジェクトの一覧から外す
  for (const [key, chats] of Object.entries(prev)) {
    if (Number(key) !== chat.project_id && chats.some((r) => r.id === chat.id)) next[Number(key)] = chats.filter((r) => r.id !== chat.id);
  }
  return next;
}

/** 削除されたチャットを一覧から消す */
export function removeChat(prev: ChatsByProject, projectId: number, id: number): ChatsByProject {
  return { ...prev, [projectId]: (prev[projectId] ?? []).filter((r) => r.id !== id) };
}

/** サーバーから届いたグループを、そのプロジェクトの一覧に入れる（同じ ID は置き換え、並び順どおりに） */
export function upsertGroup(prev: GroupsByProject, group: ChatGroup): GroupsByProject {
  const list = [group, ...(prev[group.project_id] ?? []).filter((g) => g.id !== group.id)];
  return { ...prev, [group.project_id]: list.sort(byPosition) };
}

/** 削除されたプロジェクトの分を消す（消えたチャットが「ある」ものとして残らないように） */
export function dropProject<T>(prev: Record<number, T>, projectId: number): Record<number, T> {
  if (!(projectId in prev)) return prev;
  const { [projectId]: _, ...rest } = prev;
  return rest;
}

/** 削除されたグループを一覧から消す */
export function removeGroup(prev: GroupsByProject, projectId: number, id: number): GroupsByProject {
  return { ...prev, [projectId]: (prev[projectId] ?? []).filter((g) => g.id !== id) };
}
