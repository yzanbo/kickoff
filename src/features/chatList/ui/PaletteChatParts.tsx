import type { Chat } from "@shared/chat/types";
import { WorktreeChip } from "@/foundation/ui/workplace/WorktreeChip";
import { GroupChip } from "@/features/groups/ui";
import { ProjectMark, useProjects } from "@/features/projects/ui";

/**
 * ⌘K・⌘⇧A のチャットの行の、名前のすぐ後ろのグループと作業場所の札（サイドバーの行の 2 行目と同じ `GroupChip`・`WorktreeChip`）。
 * グループなし・Git でない本体のチャットは札を出さない（中身がなければ CSS で詰める）
 */
export function PaletteChatChips({ chat }: { chat: Pick<Chat, "project_id" | "group_id" | "worktree_path" | "branch"> }) {
  return (
    <span className="palette-chips">
      <GroupChip chat={chat} />
      <WorktreeChip chat={chat} />
    </span>
  );
}

/** 行の右の薄い文のプロジェクト名の前に置く、サイドバーと同じプロジェクトの印（色の四角に頭文字。`ProjectMark`） */
export function PaletteProjectMark({ projectId }: { projectId: number }) {
  const { projectsById } = useProjects();
  return <ProjectMark project={projectsById.get(projectId)} />;
}
