import { useEffect, useMemo, useState } from "react";
import type { ProjectFiles } from "../../../../core/types";
import { api } from "../../api";
import { errorMessage } from "../../errors";
import { buildTree } from "./treeModel";

/**
 * エクスプローラーに出すファイルの木。active（すべてのファイルを表示している）の間だけ読み、
 * version が変わったら（変更の一覧を取り直したら）読み直す。中身が同じなら描き直さない
 */
export function useProjectFiles(projectId: number, active: boolean, version: number) {
  const [state, setState] = useState<{ projectId: number; files?: ProjectFiles; error?: string }>();

  useEffect(() => {
    if (!active) return;
    let alive = true;
    api.projectFiles(projectId).then(
      (files) =>
        alive &&
        setState((prev) =>
          prev?.projectId === projectId && prev.files && JSON.stringify(prev.files) === JSON.stringify(files) ? prev : { projectId, files },
        ),
      (e: unknown) => alive && setState({ projectId, error: errorMessage(e) }),
    );
    return () => {
      alive = false;
    };
  }, [projectId, active, version]);

  const current = state?.projectId === projectId ? state : undefined;
  const tree = useMemo(() => (current?.files ? buildTree(current.files) : undefined), [current?.files]);
  return { tree, truncated: Boolean(current?.files?.truncated), error: current?.error };
}
