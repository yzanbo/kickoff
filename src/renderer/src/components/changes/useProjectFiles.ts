import { useEffect, useMemo, useState } from "react";
import type { ProjectFiles } from "../../../../core/types";
import { api } from "../../api";
import { errorMessage } from "../../errors";
import { buildTree } from "./treeModel";
import { useGitTarget } from "../../worktree/worktreeContext";

/**
 * エクスプローラーに出すファイルの木。active（すべてのファイルを表示している）の間だけ読み、
 * version が変わったら（変更の一覧を取り直したら）読み直す。中身が同じなら描き直さない
 */
export function useProjectFiles(projectId: number, active: boolean, version: number) {
  const { target, key } = useGitTarget(projectId);
  const [state, setState] = useState<{ key: string; files?: ProjectFiles; error?: string }>();

  useEffect(() => {
    if (!active) return;
    let alive = true;
    api.projectFiles(target).then(
      (files) =>
        alive &&
        setState((prev) =>
          prev?.key === key && prev.files && JSON.stringify(prev.files) === JSON.stringify(files) ? prev : { key, files },
        ),
      (e: unknown) => alive && setState({ key, error: errorMessage(e) }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active, version]);

  const current = state?.key === key ? state : undefined;
  const tree = useMemo(() => (current?.files ? buildTree(current.files) : undefined), [current?.files]);
  return { tree, truncated: Boolean(current?.files?.truncated), error: current?.error };
}
