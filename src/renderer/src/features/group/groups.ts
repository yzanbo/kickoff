import { useState, type DragEvent } from "react";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import type { Chat, ChatGroup } from "@shared/types";
import { confirmDialog } from "@/ui/dialogs";
import type { DraftRef } from "@/features/panel/state/panelDrafts";
import { NO_GROUP_LABEL } from "@/features/chat/chatTitle";
import { startDragGhost } from "@/ui/dragGhost";
import { knownChat } from "@/stores/chats";
import { showDropHint } from "@/ui/DropHint";

/** チャットをグループへドラッグするときのデータの種類（ほかのドラッグと区別する） */
/** サイドバーでグループ名を押したときの知らせ（すでに表示しているグループでも、もう一度ハイライトするため） */
export const GROUP_FLASH_EVENT = "kickoff:group-flash";

/** グループのボードで、そのグループをもう一度ハイライトする（グループのタブでなければ何もしない） */
export const flashGroup = (groupId: number) => window.dispatchEvent(new CustomEvent<number>(GROUP_FLASH_EVENT, { detail: groupId }));

const CHAT_DRAG_TYPE = "application/x-kickoff-run";

/**
 * いまドラッグしているチャットの ID（ドラッグの間だけ。dragover ではデータを読めないので、落とす前に受けるかを決めるのに使う:
 * アーカイブ済みの落とし先はアーカイブしていないチャットだけ、戻す落とし先はアーカイブ済みだけを受ける）
 */
let draggingChatId: number | undefined;
if (typeof window !== "undefined") {
  const clear = () => (draggingChatId = undefined);
  window.addEventListener("dragend", clear, true);
  window.addEventListener("drop", () => setTimeout(clear), true);
}

/** いまドラッグしているチャットの ID（ドラッグの間だけ。dragover で受けるかを決める。チャットの手動の並べ替えなど） */
export const draggingChat = (): number | undefined => draggingChatId;

/** チャットのドラッグを始める（ドロップ先でチャットの ID を受け取れるようにする） */
export function startChatDrag(e: DragEvent, chatId: number, after?: () => void) {
  draggingChatId = chatId;
  e.dataTransfer.setData(CHAT_DRAG_TYPE, String(chatId));
  e.dataTransfer.effectAllowed = "move";
  // 半透明の写しがカーソルに付いて動く（下の入る位置の線・落とし先の枠が透ける）。ドラッグ中の見た目の state は次の回（after）
  startDragGhost(e, { after });
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
  startDragGhost(e);
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

/** チャットの落とし先の決まり（useChatDropTarget / useChatDropTargets。key は落とし先を見分けるもの） */
interface ChatDropRules<K> {
  /** 受けるチャットか（省くとすべて受ける） */
  accepts?: (chatId: number, key: K) => boolean;
  /** 受けないとき、外側の落とし先へ渡すチャットか（ほかのプロジェクトのチャットなど。省くと外側へも渡さない） */
  passThrough?: (chatId: number, key: K) => boolean;
  /** 受けるチャットでも、いまは落とせない理由（作業中など）。あれば落とせなくし、落とし先を赤く、カーソルの横に理由を出す */
  blockedBy?: (chatId: number, key: K) => string | null;
}

/**
 * チャットを落とせる所（サイドバーの「アーカイブ済み」など、グループ以外のドロップ先）。チャットを重ねている間は over が true になり、
 * 落とすと onDrop にチャットの ID を渡す（下書き・グループ・プロジェクトのドラッグは受けない）。props をドロップ先の要素に渡す。
 * accepts を渡すと、ドラッグしているチャットのうち受けるものだけで over にし、落とせるようにする。受けないチャットも、
 * 外側の落とし先（グループのまとまりなど）へは渡さない（グループの中の「アーカイブ済み」に、そのアーカイブ済みのチャットを落としても戻さない）。
 * ただし passThrough が true のチャット（ほかのプロジェクトのチャットなど）は、受けずに外側の落とし先（プロジェクトのまとまり）へ渡す。
 * blockedBy が理由を返すチャット（作業中のチャットのアーカイブなど）は、落とせないことを見せる（blocked にその理由。落としても何もしない）
 */
export function useChatDropTarget(onDrop: (chatId: number) => void, rules: ChatDropRules<true> = {}) {
  const targets = useChatDropTargets<true>((chatId) => onDrop(chatId), rules);
  return { over: targets.over === true, blocked: targets.blockedAt(true), props: targets.propsFor(true) };
}

/**
 * useChatDropTarget の、いくつもの落とし先（key で見分ける。サイドバーの丸の列の、プロジェクトごとの丸など）を 1 つの hook で持つ形。
 * over は、いまチャットを重ねている落とし先の key（落とせないときも）。blockedAt(key) は、その落とし先に落とせない理由
 */
export function useChatDropTargets<K>(onDrop: (chatId: number, key: K) => void, { accepts, passThrough, blockedBy }: ChatDropRules<K> = {}) {
  const [over, setOver] = useState<{ key: K; blocked: string | null }>();
  const ok = (chatId: number, key: K) => accepts === undefined || accepts(chatId, key);
  return {
    over: over?.key,
    blockedAt: (key: K) => (over !== undefined && over.key === key ? over.blocked : null),
    propsFor: (key: K) => ({
      onDragOver: (e: DragEvent) => {
        if (!isChatDrag(e) || draggingChatId === undefined) return;
        const id = draggingChatId;
        if (!ok(id, key) && passThrough?.(id, key)) return;
        e.stopPropagation();
        if (!ok(id, key)) return;
        const blocked = blockedBy?.(id, key) ?? null;
        if (over?.key !== key || over.blocked !== blocked) setOver({ key, blocked });
        // 落とせないときは既定の動き（落とせない）のまま、理由をカーソルの横に出す
        if (blocked) return showDropHint(blocked, e.clientX, e.clientY);
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      },
      onDragLeave: (e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((cur) => (cur?.key === key ? undefined : cur));
      },
      onDrop: (e: DragEvent) => {
        setOver(undefined);
        const id = droppedChatId(e);
        if (id === undefined) return;
        if (!ok(id, key) && passThrough?.(id, key)) return;
        e.stopPropagation();
        e.preventDefault();
        if (ok(id, key) && !blockedBy?.(id, key)) onDrop(id, key);
      },
    }),
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
        // 動かしているまとまりを薄くする（group-dragging）のは次の回（dragstart の中で描き直すと、ドラッグが取り消されることがある）
        startDragGhost(e, { after: () => setDragging(id) });
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
 * onReorder にグループの並びと動かしたあとの「No Group」の位置を渡す（グループのボード・サイドバー）。
 * onRestoreChat があれば、アーカイブ済みのチャットを落としたときは、移す代わりにそれを呼ぶ（サイドバー: 確かめて戻し、そのグループへ移す）
 */
export function useGroupDrop({
  projectId,
  groups,
  chats,
  ungroupedAt,
  onReorder,
  onMoveChat,
  onMoveDraft,
  onRestoreChat,
  onForeignChat,
  foreignBlockedBy,
}: {
  projectId: number;
  groups: ChatGroup[];
  chats: Chat[];
  ungroupedAt?: number;
  onReorder: (ids: number[], ungroupedAt?: number) => void;
  onMoveChat: (chat: Chat, groupId: number | null) => void;
  onRestoreChat?: (chat: Chat, groupId: number | null) => void;
  onMoveDraft?: (draft: DraftRef, groupId: number | null) => void;
  /** ほかのプロジェクトのチャットを落としたとき（なければ受けず、外側の落とし先へ渡す） */
  onForeignChat?: (chat: Chat, groupId: number | null) => void;
  /** ほかのプロジェクトのチャットを、いまは移せない理由（作業中など）。あれば落とせなくし、赤い枠とカーソルの横の理由で見せる */
  foreignBlockedBy?: (chat: Chat) => string | null;
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
  /** 重ねているほかのプロジェクトのチャットを、いまは移せない理由（なければ null） */
  const [blocked, setBlocked] = useState<string | null>(null);

  /** ほかのプロジェクトのチャットか（分からない = このプロジェクトの外の一覧にないものは、ほかのプロジェクトとみなさない） */
  const foreign = (chat: Chat | undefined) => chat !== undefined && chat.project_id !== projectId;
  const dropProps = (groupId: number | null) => ({
    onDragOver: (e: DragEvent) => {
      if (reorder.over(e, sortId(groupId))) return;
      if (!isChatDrag(e) && !(onMoveDraft && e.dataTransfer.types.includes(DRAFT_DRAG_TYPE))) return;
      // ほかのプロジェクトのチャットは、受ける（onForeignChat）ときだけ。受けなければ外側（プロジェクトのまとまり）へ渡す
      const other = isChatDrag(e) && draggingChatId !== undefined ? knownChat(draggingChatId) : undefined;
      const reason = foreign(other) ? (foreignBlockedBy?.(other!) ?? null) : null;
      if (foreign(other)) {
        if (!onForeignChat) return;
        e.stopPropagation();
      }
      if (reason !== blocked) setBlocked(reason);
      if (reason) {
        setOver(groupId ?? "none");
        return showDropHint(reason, e.clientX, e.clientY);
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOver(groupId ?? "none");
    },
    onDragLeave: (e: DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setOver(undefined);
      setBlocked(null);
      reorder.leave(sortId(groupId));
    },
    onDrop: (e: DragEvent) => {
      setOver(undefined);
      setBlocked(null);
      if (reorder.drop(e, sortId(groupId))) return;
      e.preventDefault();
      const draft = onMoveDraft && droppedDraft(e);
      if (draft) return onMoveDraft(draft, groupId);
      const id = droppedChatId(e);
      const other = id === undefined ? undefined : knownChat(id);
      if (foreign(other)) {
        if (!onForeignChat) return;
        e.stopPropagation();
        if (foreignBlockedBy?.(other!)) return;
        return onForeignChat(other!, groupId);
      }
      const chat = chats.find((r) => r.id === id);
      if (chat?.archived_at && onRestoreChat) return onRestoreChat(chat, groupId);
      if (chat && chat.group_id !== groupId) onMoveChat(chat, groupId);
    },
  });

  return { reorder, over, blocked: over === undefined ? null : blocked, dropProps };
}
