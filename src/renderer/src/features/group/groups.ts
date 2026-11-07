import { useState, type DragEvent } from "react";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import type { Chat, ChatGroup } from "@shared/types";
import { confirmDialog } from "@/ui/dialogs";
import type { DraftRef } from "@/features/panel/state/panelDrafts";
import { NO_GROUP_LABEL } from "@/features/chat/chatTitle";
import { markDragSnapshot } from "@/ui/dragSnapshot";

/** チャットをグループへドラッグするときのデータの種類（ほかのドラッグと区別する） */
/** サイドバーでグループ名を押したときの知らせ（すでに表示しているグループでも、もう一度ハイライトするため） */
export const GROUP_FLASH_EVENT = "kickoff:group-flash";

/** グループのボードで、そのグループをもう一度ハイライトする（グループのタブでなければ何もしない） */
export const flashGroup = (groupId: number) => window.dispatchEvent(new CustomEvent<number>(GROUP_FLASH_EVENT, { detail: groupId }));

const CHAT_DRAG_TYPE = "application/x-kickoff-run";

/** チャットのドラッグを始める（ドロップ先でチャットの ID を受け取れるようにする） */
export function startChatDrag(e: DragEvent, chatId: number, after?: () => void) {
  e.dataTransfer.setData(CHAT_DRAG_TYPE, String(chatId));
  e.dataTransfer.effectAllowed = "move";
  // ドラッグの絵の背景を半透明に（下の入る位置の線・落とし先の枠が透ける）。ドラッグ中の見た目の state は写したあと（after）
  markDragSnapshot(e, after);
}

/** ドラッグ中のものがチャットか */
function isChatDrag(e: DragEvent): boolean {
  return e.dataTransfer.types.includes(CHAT_DRAG_TYPE);
}

/** 送る前の新しいチャット（下書き）をグループへドラッグするときのデータの種類 */
const DRAFT_DRAG_TYPE = "application/x-kickoff-draft";

/** 下書きのドラッグを始める（ドロップ先で、どのボード・チャット欄のどのタブかを受け取れるようにする） */
export function startDraftDrag(e: DragEvent, draft: DraftRef) {
  e.dataTransfer.setData(DRAFT_DRAG_TYPE, JSON.stringify({ panel: draft.panel, key: draft.key }));
  e.dataTransfer.effectAllowed = "move";
  markDragSnapshot(e);
}

/** ドロップされた下書き（下書きでなければ undefined） */
function droppedDraft(e: DragEvent): DraftRef | undefined {
  try {
    const d = JSON.parse(e.dataTransfer.getData(DRAFT_DRAG_TYPE)) as Partial<DraftRef>;
    return typeof d.panel === "string" && typeof d.key === "string" ? { panel: d.panel, key: d.key } : undefined;
  } catch {
    return undefined;
  }
}

/** 並べ替えのドラッグのデータの種類（グループ・プロジェクト） */
const GROUP_DRAG_TYPE = "application/x-kickoff-group";
export const PROJECT_DRAG_TYPE = "application/x-kickoff-project";

/**
 * moved を target の位置へ動かした並び。上から下へ動かすときは target の後ろ、
 * 下から上へ動かすときは target の前に入る（どちらも target がいた位置に収まる）
 */
export function reorderIds(ids: number[], moved: number, target: number): number[] {
  const to = ids.indexOf(target);
  if (moved === target || to < 0 || !ids.includes(moved)) return ids;
  const next = ids.filter((id) => id !== moved);
  next.splice(to, 0, moved);
  return next;
}

/** ドロップされたチャットの ID（チャットでなければ undefined） */
function droppedChatId(e: DragEvent): number | undefined {
  const id = Number(e.dataTransfer.getData(CHAT_DRAG_TYPE));
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

/** いまチャットをドラッグしているか（ドラッグの間だけ出す落とし先に使う。アーカイブ済みのまとまりがないときの「アーカイブ済み」など） */
export function useChatDragging(): boolean {
  const [dragging, setDragging] = useState(false);
  // 行がドラッグのデータを入れたあと（React の onDragStart のあと）に見るので、window の bubble で受ける
  useWindowEvent("dragstart", (e) => e.dataTransfer?.types.includes(CHAT_DRAG_TYPE) && setDragging(true));
  useWindowEvent("dragend", () => setDragging(false), dragging, true);
  useWindowEvent("drop", () => setDragging(false), dragging, true);
  return dragging;
}

/**
 * チャットを落とせる所（サイドバーの「アーカイブ済み」など、グループ以外のドロップ先）。チャットを重ねている間は over が true になり、
 * 落とすと onDrop にチャットの ID を渡す（下書き・グループ・プロジェクトのドラッグは受けない）。props をドロップ先の要素に渡す
 */
export function useChatDropTarget(onDrop: (chatId: number) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!isChatDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      },
      onDragLeave: (e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (e: DragEvent) => {
        setOver(false);
        const id = droppedChatId(e);
        if (id === undefined) return;
        e.preventDefault();
        onDrop(id);
      },
    },
  };
}

/**
 * ドラッグでの並べ替え（グループ・プロジェクトで共通）。
 * 動かしているものを薄くし、入る位置に線を出す（後ろへ動かすときは相手の後ろ、前へは前）。
 */
export function useReorder(ids: number[], onReorder: (ids: number[]) => void, dragType: string = GROUP_DRAG_TYPE) {
  const [dragging, setDragging] = useState<number>();
  const [target, setTarget] = useState<{ id: number; side: "before" | "after" }>();
  const end = () => {
    setDragging(undefined);
    setTarget(undefined);
  };

  return {
    /** いま動かしているもの（つかんでいなければ undefined） */
    dragging,
    /** つかむところ（グループの見出し・プロジェクトのアイコンなど）に付ける */
    handle: (id: number) => ({
      onDragStart: (e: DragEvent) => {
        e.dataTransfer.setData(dragType, String(id));
        e.dataTransfer.effectAllowed = "move";
        // 動かしているものを薄くする（group-dragging）のは、ドラッグの絵を写したあと（先に描き直すと、薄い絵になる）
        markDragSnapshot(e, () => setDragging(id));
      },
      onDragEnd: end,
    }),
    /** dragover。この並べ替えのドラッグでなければ false（チャットのドロップなど、ほかの処理に任せる） */
    over: (e: DragEvent, id: number | null): boolean => {
      if (!e.dataTransfer.types.includes(dragType)) return false;
      const from = dragging === undefined ? -1 : ids.indexOf(dragging);
      const to = id === null ? -1 : ids.indexOf(id);
      if (from < 0 || to < 0 || from === to) {
        setTarget(undefined);
        return true;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const side = from < to ? "after" : "before";
      if (target?.id !== id || target.side !== side) setTarget({ id: id!, side });
      return true;
    },
    /** dragleave（要素の外へ出たとき） */
    leave: (id: number | null) => {
      if (id !== null && target?.id === id) setTarget(undefined);
    },
    /** drop。この並べ替えのドロップでなければ false */
    drop: (e: DragEvent, id: number | null): boolean => {
      // 0 はグループのボードの「No Group」（UNGROUPED_SORT_ID）。この種類のデータがなければ並べ替えではない
      const raw = e.dataTransfer.getData(dragType);
      const moved = Number(raw);
      if (raw === "" || !Number.isInteger(moved) || moved < 0) return false;
      e.preventDefault();
      end();
      if (id !== null) {
        const next = reorderIds(ids, moved, id);
        if (next !== ids) onReorder(next);
      }
      return true;
    },
    /** 並べ替える要素に付けるクラス: 動かしている途中 / 入る位置の線 */
    classFor: (id: number) => `${dragging === id ? "group-dragging" : ""} ${target?.id === id ? `drop-${target.side}` : ""}`,
  };
}

/** グループの並べ替え（サイドバーとグループのボード） */
function useGroupReorder(ids: number[], onReorder: (ids: number[]) => void) {
  return useReorder(ids, onReorder, GROUP_DRAG_TYPE);
}

/** グループのボードで、並べ替えの並びの中の「No Group」の ID（グループの ID は 1 から） */
export const UNGROUPED_SORT_ID = 0;

/** グループの削除を確かめる（中のチャットは消えず、グループなしに戻る） */
export function confirmDeleteGroup(group: Pick<ChatGroup, "name">): Promise<boolean> {
  return confirmDialog({
    title: `グループ「${group.name}」を削除しますか？`,
    message: `中のチャットは消えず、「${NO_GROUP_LABEL}」に戻ります。`,
    confirmLabel: "削除",
    danger: true,
  });
}

/**
 * グループ（とグループなし）をドロップ先にする（サイドバーとグループのボードで共通）。
 * チャットはそのグループへ移し（groupId が null ならグループから外す）、グループの見出しはその位置へ並べ替える。
 * onMoveDraft があれば、送る前の新しいチャット（下書き）も受け取り、作成先のグループを変える（サイドバー）。
 * ungroupedAt（グループの並びの中の「No Group」の位置）を渡すと、「No Group」も並べ替えの並びに入れ（ID は UNGROUPED_SORT_ID）、
 * onReorder にグループの並びと動かしたあとの「No Group」の位置を渡す（グループのボード）
 */
export function useGroupDrop({
  groups,
  chats,
  ungroupedAt,
  onReorder,
  onMoveChat,
  onMoveDraft,
}: {
  groups: ChatGroup[];
  chats: Chat[];
  ungroupedAt?: number;
  onReorder: (ids: number[], ungroupedAt?: number) => void;
  onMoveChat: (chat: Chat, groupId: number | null) => void;
  onMoveDraft?: (draft: DraftRef, groupId: number | null) => void;
}) {
  const sortable = ungroupedAt !== undefined;
  const ids = groups.map((g) => g.id);
  if (sortable) ids.splice(Math.min(Math.max(ungroupedAt, 0), ids.length), 0, UNGROUPED_SORT_ID);
  const reorder = useGroupReorder(ids, (next) =>
    sortable ? onReorder(next.filter((id) => id !== UNGROUPED_SORT_ID), next.indexOf(UNGROUPED_SORT_ID)) : onReorder(next),
  );
  /** 並べ替えの並びの中の ID（「No Group」は並べ替えるときだけ UNGROUPED_SORT_ID） */
  const sortId = (groupId: number | null) => groupId ?? (sortable ? UNGROUPED_SORT_ID : null);
  /** ドラッグ中のチャットを重ねている先（グループの ID / "none" はグループなし） */
  const [over, setOver] = useState<number | "none">();

  const dropProps = (groupId: number | null) => ({
    onDragOver: (e: DragEvent) => {
      if (reorder.over(e, sortId(groupId))) return;
      if (!isChatDrag(e) && !(onMoveDraft && e.dataTransfer.types.includes(DRAFT_DRAG_TYPE))) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOver(groupId ?? "none");
    },
    onDragLeave: (e: DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setOver(undefined);
      reorder.leave(sortId(groupId));
    },
    onDrop: (e: DragEvent) => {
      setOver(undefined);
      if (reorder.drop(e, sortId(groupId))) return;
      e.preventDefault();
      const draft = onMoveDraft && droppedDraft(e);
      if (draft) return onMoveDraft(draft, groupId);
      const chat = chats.find((r) => r.id === droppedChatId(e));
      if (chat && chat.group_id !== groupId) onMoveChat(chat, groupId);
    },
  });

  return { reorder, over, dropProps };
}
