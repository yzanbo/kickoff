import { useMemo } from "react";
import type { ProjectFiles } from "@shared/types";
import { api } from "@/api";
import { useKeyedAsync } from "@/hooks/useKeyedAsync";
import { openProjectFile } from "@/app/router";
import type { FileLinks } from "./fileLinkContext";
import { buildFileIndex } from "./fileRefs";

/** 取り直した一覧が前と同じか（同じなら描き直さない） */
const sameFiles = (a: ProjectFiles, b: ProjectFiles) => a.truncated === b.truncated && a.files.join("\n") === b.files.join("\n");

/**
 * チャットの返答のファイルのチップに使う情報（FileLinkContext に入れる）。
 * チャットの作業場所（ワークツリーならそのフォルダ、なければ本体）のファイルの一覧を読み、
 * 押したらその作業場所のファイルをエディタタブで開く。作業が終わるたびに一覧を読み直す（新しく作ったファイルもチップにする）。
 * 一覧が読めない（フォルダが消えたなど）間は undefined（チップにしない）
 */
export function useFileLinks(run: { project_id: number; worktree_path: string; status: string }, repoPath: string | undefined): FileLinks | undefined {
  const projectId = run.project_id;
  const worktree = run.worktree_path || undefined;
  const root = worktree ?? repoPath;
  const { data } = useKeyedAsync(`${projectId}:${worktree ?? ""}`, () => api.projectFiles({ projectId, worktree }), {
    deps: [run.status],
    same: sameFiles,
  });
  return useMemo(
    () =>
      data && root
        ? {
            index: buildFileIndex(data.files, root, data.truncated),
            open: (ref) => openProjectFile(projectId, { ...ref, ...(worktree ? { worktree } : {}) }),
          }
        : undefined,
    [data, root, projectId, worktree],
  );
}
