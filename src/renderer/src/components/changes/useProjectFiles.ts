import { useMemo } from "react";
import type { ProjectFiles } from "../../../../core/types";
import { api } from "../../api";
import { useKeyedAsync } from "../../hooks/useKeyedAsync";
import { buildTree } from "./treeModel";
import { useGitTarget } from "../../worktree/worktreeContext";

/**
 * エクスプローラーに出すファイルの木。active（すべてのファイルを表示している）の間だけ読み、
 * version が変わったら（変更の一覧を取り直したら）読み直す。中身が同じなら描き直さない
 */
export function useProjectFiles(projectId: number, active: boolean, version: number) {
  const { target, key } = useGitTarget(projectId);
  const { data: files, error } = useKeyedAsync(key, () => api.projectFiles(target), { active, deps: [version], same: sameFiles });
  const tree = useMemo(() => (files ? buildTree(files) : undefined), [files]);
  return { tree, truncated: Boolean(files?.truncated), error };
}

/** 取り直した結果が前と同じか（同じなら描き直さない） */
const sameFiles = (a: ProjectFiles, b: ProjectFiles) => JSON.stringify(a) === JSON.stringify(b);
