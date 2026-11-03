import { useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import type { Run, RunGroup } from "../../../../core/types";
import { api } from "../../api";
import { cx } from "../../cx";
import { confirmDeleteGroup, useGroupDrop } from "../../groups";
import { useGroupMenu } from "../menus/GroupMenu";
import { setDraftGroup } from "../sidePanel/panelMemory";

/** サイドバーのグループ 1 つに渡す、見出しの操作の束（メニュー・名前の変更・ドロップ先・並べ替え） */
export interface GroupSectionProps {
  menu: { openFor: (group: RunGroup, e: MouseEvent) => void; button: (group: RunGroup) => ReactNode };
  renaming: boolean;
  onRenameStart: () => void;
  onRenameEnd: () => void;
  /** ドロップ先・並べ替えの見た目（チャットと下書きを受け取る） */
  dropClass?: string;
  dropProps: Record<string, unknown>;
  dragProps: { onDragStart: (e: DragEvent) => void; onDragEnd: () => void };
}

/**
 * サイドバーの自分で作ったグループの操作（プロジェクトごとに 1 つ）: 「…」メニュー（名前を変更・削除）・名前の変更中のグループ・
 * ドロップ先（チャットはそのグループへ、グループの見出しはその位置へ並べ替える）。グループごとの束は sectionProps(group) で取る
 */
export function useGroupSections({ projectId, groups, runs }: { projectId: number; groups: RunGroup[]; runs: Run[] }) {
  const [renaming, setRenaming] = useState<number>();
  const removeGroup = async (group: RunGroup) => {
    if (await confirmDeleteGroup(group)) await api.deleteGroup(group.id);
  };
  // グループの「…」メニュー（右クリックでも開く）
  const menu = useGroupMenu({ onRename: (g) => setRenaming(g.id), onDelete: (g) => void removeGroup(g) });
  const { reorder, over, dropProps } = useGroupDrop({
    groups,
    runs,
    onReorder: (ids) => void api.reorderGroups(projectId, ids),
    onMoveRun: (run, groupId) => void api.setRunGroup(run.id, groupId),
    // 送る前の新しいチャット（下書き）は、作成先のグループを変える（送ったときにそのグループに入る）
    onMoveDraft: (draft, groupId) => setDraftGroup(draft, groupId ?? undefined, groups.find((g) => g.id === groupId)?.name),
  });
  return {
    sectionProps: (group: RunGroup): GroupSectionProps => ({
      menu,
      renaming: renaming === group.id,
      onRenameStart: () => setRenaming(group.id),
      onRenameEnd: () => setRenaming(undefined),
      dropClass: cx(over === group.id && "drop-target", reorder.classFor(group.id)),
      dropProps: dropProps(group.id),
      dragProps: reorder.handle(group.id),
    }),
    /** 「グループなし」をドロップ先にする（チャットをグループから外す） */
    ungroupedDrop: { over: over === "none", props: dropProps(null) },
    /** 開いているメニュー（プロジェクトの要素の中に描く） */
    menuElement: menu.menu,
  };
}
