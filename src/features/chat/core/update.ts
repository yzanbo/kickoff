// チャットを変える決まり（名前・固定・グループ・アーカイブ）を、HTTP の口（PATCH /api/chats/:id）と AI のツール（update_chat・archive_chat）で 1 つにする。
// 先にすべて確かめてから変える（planChatUpdate で断るものを全部見て、applyChatUpdate で変える。途中で断って一部だけ変わらないように）。
// 断る理由は ChatUpdateRefused の kind で返し、文は呼ぶ側が決める（HTTP は 400・404、AI は理由の文）
import { CHAT_TITLE_MAX } from "@shared/chat/types";
import type { Chat } from "@shared/chat/types";
import type { ChatGroup } from "@shared/groups/types";
import { Invalid, NotFound } from "@/foundation/core/errors";
import type { ChatStoreDeps } from "./stores";
import { descendantsOf } from "./family";

/** 変える項目（省いた項目は変えない。groupId は null のときグループから外す） */
export interface ChatPatch {
  title?: string;
  pinned?: boolean;
  groupId?: number | null;
  archived?: boolean;
}

/** 断る理由 */
export type ChatUpdateRefusal = "title_empty" | "title_long" | "child_group" | "group_missing" | "group_other_project";

export class ChatUpdateRefused extends Error {
  constructor(readonly kind: ChatUpdateRefusal) {
    super(kind);
  }
}

/** 確かめ終えた変更（apply に渡す。値が同じ項目は入れない） */
export interface ChatUpdatePlan {
  target: Chat;
  title?: string;
  pinned?: boolean;
  group?: { id: number | null; group: ChatGroup | null };
  archived?: boolean;
}

/** 変えたこと（AI に返す文を作る） */
export type ChatChange = { kind: "title"; from: string; to: string } | { kind: "pinned"; to: boolean } | { kind: "group"; group: ChatGroup | null } | { kind: "archived"; to: boolean };

/** 決まりが読むもの */
export interface ChatUpdateDeps {
  store: Pick<ChatStoreDeps, "chats" | "groups">;
  /** 作業中なら Conflict で断る（アーカイブ） */
  requireIdle(chatId: number, action: string): void;
}

/**
 * 変更を確かめる（断るなら ChatUpdateRefused・作業中は Conflict）。名前は前後の空白を除き、空・長すぎるは断る。グループに入るのは親のないチャットだけ
 * （becomesRoot = この変更と一緒に親から外して親のないチャットにする。strictChildGroup = 子チャットには null も渡させない = AI の決まり）。
 * アーカイブは子孫ごとしまうので、まだしまっていない子孫が作業中なら断る
 */
export function planChatUpdate(d: ChatUpdateDeps, target: Chat, patch: ChatPatch, opts: { becomesRoot?: boolean; strictChildGroup?: boolean } = {}): ChatUpdatePlan {
  const plan: ChatUpdatePlan = { target };
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw new ChatUpdateRefused("title_empty");
    if (title.length > CHAT_TITLE_MAX) throw new ChatUpdateRefused("title_long");
    if (title !== target.title) plan.title = title;
  }
  if (patch.groupId !== undefined) {
    const isChild = target.parent_chat_id !== null && !opts.becomesRoot;
    if (isChild && (patch.groupId !== null || opts.strictChildGroup)) throw new ChatUpdateRefused("child_group");
    const group = patch.groupId === null ? null : (d.store.groups.get(patch.groupId) ?? null);
    if (patch.groupId !== null && !group) throw new ChatUpdateRefused("group_missing");
    if (group && group.project_id !== target.project_id) throw new ChatUpdateRefused("group_other_project");
    if (patch.groupId !== target.group_id) plan.group = { id: patch.groupId, group };
  }
  if (patch.pinned !== undefined && patch.pinned !== target.pinned) plan.pinned = patch.pinned;
  // アーカイブはいまの値でも行う（しまってから戻した子孫も、もう一度しまう）
  if (patch.archived !== undefined) {
    if (patch.archived) requireFamilyIdle(d, target);
    plan.archived = patch.archived;
  }
  return plan;
}

/** 確かめ終えた変更を行う（グループ → 固定 → 名前 → アーカイブの順）。変えたあとのチャットと変えたことを返す */
export function applyChatUpdate(chats: ChatStoreDeps["chats"], plan: ChatUpdatePlan): { chat: Chat; changes: ChatChange[] } {
  const { target } = plan;
  const changes: ChatChange[] = [];
  if (plan.group) {
    chats.setGroup(target.id, plan.group.id);
    changes.push({ kind: "group", group: plan.group.group });
  }
  if (plan.pinned !== undefined) {
    chats.setPinned(target.id, plan.pinned);
    changes.push({ kind: "pinned", to: plan.pinned });
  }
  if (plan.title !== undefined) {
    chats.update(target.id, { title: plan.title });
    changes.push({ kind: "title", from: target.title, to: plan.title });
  }
  if (plan.archived !== undefined) {
    // 子チャット（子・孫…）も一緒にしまう。戻すときは、一緒にしまった子孫だけを戻す（store.chats.archive）
    chats.archive(target.id, plan.archived);
    changes.push({ kind: "archived", to: plan.archived });
  }
  return { chat: chats.get(target.id) ?? target, changes };
}

/** 子孫ごとアーカイブする（まだしまっていないものが作業中なら Conflict。AI の archive_chat がその場で行うとき） */
export function archiveChatFamily(d: ChatUpdateDeps, chat: Chat): void {
  requireFamilyIdle(d, chat);
  d.store.chats.archive(chat.id, true);
}

/** まだしまっていない自分と子孫が作業中でないか */
function requireFamilyIdle(d: ChatUpdateDeps, chat: Chat): void {
  for (const c of [chat, ...descendantsOf(d.store.chats, chat.id)]) if (c.archived_at === null) d.requireIdle(c.id, "アーカイブ");
}

/** チャットを変える口で断る理由の応答（名前の空・長さは本文の確かめが先に 400 にする） */
export const HTTP_REFUSALS: Record<ChatUpdateRefusal, () => Error> = {
  title_empty: () => new Invalid("名前が空です"),
  title_long: () => new Invalid("名前が長すぎます"),
  child_group: () => new Invalid("子チャットはグループに入りません（グループを変えられるのは親のないチャットだけです）"),
  group_missing: () => new NotFound("グループが見つかりません"),
  group_other_project: () => new Invalid("ほかのプロジェクトのグループには入れられません"),
};

/** 決まりが断ったら、その理由の応答にして投げ直す */
export function refusedAs<T>(fn: () => T, as: Record<ChatUpdateRefusal, () => Error>): T {
  try {
    return fn();
  } catch (e) {
    throw e instanceof ChatUpdateRefused ? as[e.kind]() : e;
  }
}
