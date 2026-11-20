// ファイルを開く行き先（open({ kind: "file" })。右サイドバーがファイルを見せていればそこで、なければファイルタブで開く）
import { trySideOpen } from "@/features/projects/ui";
import type { OpenTargetHandler } from "@/foundation/ui/navigation/open";
import { navigate, type FileTarget } from "@/foundation/ui/navigation/router";

declare module "@/foundation/ui/navigation/open" {
  interface OpenTargetMap {
    /** プロジェクトのファイル（line があればその行へ移る。worktree はワークツリーのフォルダ、なければ本体） */
    file: { projectId: number; path: string; line?: number; worktree?: string | null };
  }
}

export const fileTarget: OpenTargetHandler<"file"> = {
  kind: "file",
  open({ projectId, path, line, worktree }, { replace }) {
    const file: FileTarget = { path, ...(line ? { line } : {}), ...(worktree ? { worktree } : {}) };
    if (trySideOpen(projectId, { kind: "file", file })) return true;
    navigate({ name: "project", id: projectId, tab: "files", file }, { replace });
    return true;
  },
};
