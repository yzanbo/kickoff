import { useState, type DragEvent } from "react";
import type { Run, RunGroup } from "../../core/types";
import { confirmDialog } from "./dialogs";
import type { DraftRef } from "./components/sidePanel/panelMemory";

/** チャットをグループへドラッグするときのデータの種類（ほかのドラッグと区別する） */
/** サイドバーでグループ名を押したときの知らせ（すでに表示しているグループでも、もう一度ハイライトするため） */
export const GROUP_FLASH_EVENT = "kickoff:group-flash";

/** グループのボードで、そのグループをもう一度ハイライトする（グループのタブでなければ何もしない） */
export const flashGroup = (groupId: number) => window.dispatchEvent(new CustomEvent<number>(GROUP_FLASH_EVENT, { detail: groupId }));

const RUN_DRAG_TYPE = "application/x-kickoff-run";

/** チャットのドラッグを始める（ドロップ先でチャットの ID を受け取れるようにする） */
export function startRunDrag(e: DragEvent, runId: number) {
  e.dataTransfer.setData(RUN_DRAG_TYPE, String(runId));
  e.dataTransfer.effectAllowed = "move";
}

/** ドラッグ中のものがチャットか */
function isRunDrag(e: DragEvent): boolean {
  return e.dataTransfer.types.includes(RUN_DRAG_TYPE);
}

/** 送る前の新しいチャット（下書き）をグループへドラッグするときのデータの種類 */
const DRAFT_DRAG_TYPE = "application/x-kickoff-draft";

/** 下書きのドラッグを始める（ドロップ先で、どのボード・チャット欄のどのタブかを受け取れるようにする） */
export function startDraftDrag(e: DragEvent, draft: DraftRef) {
  e.dataTransfer.setData(DRAFT_DRAG_TYPE, JSON.stringify({ memoryKey: draft.memoryKey, key: draft.key }));
  e.dataTransfer.effectAllowed = "move";
}

/** ドロップされた下書き（下書きでなければ undefined） */
function droppedDraft(e: DragEvent): DraftRef | undefined {
  try {
    const d = JSON.parse(e.dataTransfer.getData(DRAFT_DRAG_TYPE)) as Partial<DraftRef>;
    return typeof d.memoryKey === "string" && typeof d.key === "string" ? { memoryKey: d.memoryKey, key: d.key } : undefined;
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
function droppedRunId(e: DragEvent): number | undefined {
  const id = Number(e.dataTransfer.getData(RUN_DRAG_TYPE));
  return Number.isInteger(id) && id > 0 ? id : undefined;
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
    /** つかむところ（グループの見出し・プロジェクトのアイコンなど）に付ける */
    handle: (id: number) => ({
      onDragStart: (e: DragEvent) => {
        e.dataTransfer.setData(dragType, String(id));
        e.dataTransfer.effectAllowed = "move";
        setDragging(id);
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
      const moved = Number(e.dataTransfer.getData(dragType));
      if (!Number.isInteger(moved) || moved <= 0) return false;
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

/** グループの削除を確かめる（中のチャットは消えず、グループなしに戻る） */
export function confirmDeleteGroup(group: Pick<RunGroup, "name">): Promise<boolean> {
  return confirmDialog({
    title: `グループ「${group.name}」を削除しますか？`,
    message: "中のチャットは消えず、グループなしに戻ります。",
    confirmLabel: "削除",
    danger: true,
  });
}

/**
 * グループ（とグループなし）をドロップ先にする（サイドバーとグループのボードで共通）。
 * チャットはそのグループへ移し（groupId が null ならグループから外す）、グループの見出しはその位置へ並べ替える。
 * onMoveDraft があれば、送る前の新しいチャット（下書き）も受け取り、作成先のグループを変える（サイドバー）
 */
export function useGroupDrop({
  groups,
  runs,
  onReorder,
  onMoveRun,
  onMoveDraft,
}: {
  groups: RunGroup[];
  runs: Run[];
  onReorder: (ids: number[]) => void;
  onMoveRun: (run: Run, groupId: number | null) => void;
  onMoveDraft?: (draft: DraftRef, groupId: number | null) => void;
}) {
  const reorder = useGroupReorder(
    groups.map((g) => g.id),
    onReorder,
  );
  /** ドラッグ中のチャットを重ねている先（グループの ID / "none" はグループなし） */
  const [over, setOver] = useState<number | "none">();

  const dropProps = (groupId: number | null) => ({
    onDragOver: (e: DragEvent) => {
      if (reorder.over(e, groupId)) return;
      if (!isRunDrag(e) && !(onMoveDraft && e.dataTransfer.types.includes(DRAFT_DRAG_TYPE))) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOver(groupId ?? "none");
    },
    onDragLeave: (e: DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setOver(undefined);
      reorder.leave(groupId);
    },
    onDrop: (e: DragEvent) => {
      setOver(undefined);
      if (reorder.drop(e, groupId)) return;
      e.preventDefault();
      const draft = onMoveDraft && droppedDraft(e);
      if (draft) return onMoveDraft(draft, groupId);
      const run = runs.find((r) => r.id === droppedRunId(e));
      if (run && run.group_id !== groupId) onMoveRun(run, groupId);
    },
  });

  return { reorder, over, dropProps };
}
