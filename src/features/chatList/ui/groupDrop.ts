import { useState, type DragEvent } from "react";
import type { Chat } from "@shared/chat/types";
import type { ChatGroup } from "@shared/groups/types";
import { api } from "@/foundation/ui/api";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { showDropHint } from "@/foundation/ui/kit/DropHint";
import { useReorder } from "@/foundation/ui/kit/drag/useReorder";
import { ensureAllRows } from "@/foundation/ui/hooks/useProgressiveRows";
import { moveInList } from "@/foundation/ui/lib/moveInList";
import { confirmArchiveChats, knownChat } from "@/features/chat/ui";
import { UNGROUPED_SORT_ID } from "@/features/groups/ui";
import { classifyDrop, type DropKind } from "./classifyDrop";
import { CHAT_DRAG, DRAFT_DRAG, GROUP_DRAG_TYPE, type DraftRef } from "./drag";

/** 落とした物ごとの扱い（groupId は落とした先のグループ。null はグループなし）。chat 以外は、ないと受けない */
export interface GroupDropHandlers {
  /** 同じプロジェクトのチャットを、ほかのグループから落とした */
  chat(chat: Chat, groupId: number | null): void;
  /** 同じプロジェクトのアーカイブ済みのチャット（なければふつうのチャットとして chat） */
  archived?(chat: Chat, groupId: number | null): void;
  /** 送る前の新しいチャット（下書き） */
  draft?(draft: DraftRef, groupId: number | null): void;
  /** ほかのプロジェクトのチャット（なければ受けず、外側の落とし先へ渡す） */
  foreign?(chat: Chat, groupId: number | null): void;
  /** 同じプロジェクトの子チャット */
  child?(chat: Chat, groupId: number | null): void;
}

/**
 * グループ（とグループなし）を落とし先にする（サイドバー・全プロジェクトのボードのグループの列・プロジェクトのボードの段で共通）。
 * 落とした物の種類は classifyDrop で決め、on の表の扱いを引く。グループの見出しはその位置へ並べ替える（上から下へは相手の後ろ・下から上へは前）。
 * ungroupedAt（グループの並びの中の「No Group」の位置）を渡すと、「No Group」も並べ替えの並びに入れ（ID は UNGROUPED_SORT_ID）、
 * onReorder にグループの並びと動かしたあとの「No Group」の位置を渡す。blockedBy は種類ごとの、いまは落とせない理由（作業中など。赤い枠とカーソルの横の理由で見せる）
 */
export function useGroupDrop({
  projectId,
  groups,
  ungroupedAt,
  onReorder,
  on,
  blockedBy = {},
}: {
  projectId: number;
  groups: readonly ChatGroup[];
  ungroupedAt?: number;
  onReorder: (ids: number[], ungroupedAt?: number) => void;
  on: GroupDropHandlers;
  blockedBy?: Partial<Record<DropKind, (chat: Chat) => string | null>>;
}) {
  const sortable = ungroupedAt !== undefined;
  const ids = groups.map((g) => g.id);
  if (sortable) ids.splice(Math.min(Math.max(ungroupedAt, 0), ids.length), 0, UNGROUPED_SORT_ID);
  const reorder = useReorder({
    keys: ids,
    type: GROUP_DRAG_TYPE,
    axis: "y",
    sideBy: "order",
    onStart: ensureAllRows,
    onMove: (from, to, side) => {
      const next = moveInList(ids, from, to, side);
      if (!next) return;
      if (sortable) onReorder(next.filter((id) => id !== UNGROUPED_SORT_ID), next.indexOf(UNGROUPED_SORT_ID));
      else onReorder(next);
    },
  });
  /** 並べ替えの並びの中の ID（「No Group」は並べ替えるときだけ UNGROUPED_SORT_ID） */
  const sortId = (groupId: number | null) => groupId ?? (sortable ? UNGROUPED_SORT_ID : null);
  /** ドラッグ中のチャットを重ねている先（グループの ID / "none" はグループなし） */
  const [over, setOver] = useState<number | "none">();
  /** 重ねているチャットを、いまは落とせない理由（なければ null） */
  const [blocked, setBlocked] = useState<string | null>(null);
  const handles = (kind: DropKind) => kind === "chat" || on[kind] !== undefined;
  /** ドラッグ中・落とした物の種類（チャットでも下書きでもなければ null） */
  const hit = (e: DragEvent, chatId: number | undefined): { kind: DropKind; chat?: Chat } | null => {
    const isChat = CHAT_DRAG.isIn(e);
    if (!isChat && !DRAFT_DRAG.isIn(e)) return null;
    const chat = isChat && chatId !== undefined ? knownChat(chatId) : undefined;
    const kind = classifyDrop({ chat, draft: !isChat, projectId, handles });
    return kind && { kind, chat };
  };
  const reasonOf = (kind: DropKind, chat: Chat | undefined) => (chat ? (blockedBy[kind]?.(chat) ?? null) : null);

  const dropProps = (groupId: number | null) => ({
    onDragOver: (e: DragEvent) => {
      if (reorder.over(e, sortId(groupId))) return;
      const h = hit(e, CHAT_DRAG.current());
      if (!h) return;
      // ほかのプロジェクトのチャットは、ここで受けて外側（プロジェクトのまとまり）へ渡さない
      if (h.kind === "foreign") e.stopPropagation();
      const reason = reasonOf(h.kind, h.chat);
      if (reason !== blocked) setBlocked(reason);
      setOver(groupId ?? "none");
      if (reason) return showDropHint(reason, e.clientX, e.clientY);
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    },
    onDragLeave: (e: DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setOver(undefined);
      setBlocked(null);
      reorder.leave(e, sortId(groupId));
    },
    onDrop: (e: DragEvent) => {
      setOver(undefined);
      setBlocked(null);
      if (reorder.drop(e, sortId(groupId))) return;
      e.preventDefault();
      const h = hit(e, CHAT_DRAG.read(e));
      if (!h) return;
      if (h.kind === "draft") {
        const draft = DRAFT_DRAG.read(e);
        if (draft) on.draft?.(draft, groupId);
        return;
      }
      if (h.kind === "foreign") e.stopPropagation();
      const chat = h.chat;
      if (!chat || reasonOf(h.kind, chat)) return;
      if (h.kind === "chat") {
        if (chat.group_id !== groupId) on.chat(chat, groupId);
      } else on[h.kind]?.(chat, groupId);
    },
  });

  return { reorder, over, blocked: over === undefined ? null : blocked, dropProps };
}

/** ドラッグで落としたアーカイブ済みのチャットを戻す（確かめてから。confirmArchiveChats）。groupId を渡すと、そのグループへも移す */
export async function restoreDroppedChat(chat: Chat, groupId?: number | null) {
  try {
    if (!chat.archived_at || !(await confirmArchiveChats(chat))) return;
    if (groupId !== undefined && chat.group_id !== groupId) await api.setChatGroup(chat.id, groupId);
  } catch (e) {
    reportFailure("アーカイブから戻せませんでした")(e);
  }
}
