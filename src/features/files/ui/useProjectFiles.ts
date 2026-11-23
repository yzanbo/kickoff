import { useMemo } from "react";
import { buildTree } from "@/foundation/ui/kit/list/treeModel";
import { useWorkplace } from "@/foundation/ui/workplace/workplaceContext";
import { useWorkplaceFiles } from "./filesStore";

/**
 * エクスプローラーに出すファイルの木。active（すべてのファイルを表示している）の間だけ読み、
 * version が変わったら（変更の一覧を取り直したら）読み直す。中身が同じなら描き直さない
 */
export function useProjectFiles(projectId: number, active: boolean, version: number) {
  const { data: files, error } = useWorkplaceFiles(useWorkplace(projectId), { active, version });
  const tree = useMemo(() => (files ? buildTree(files) : undefined), [files]);
  return { tree, truncated: Boolean(files?.truncated), error };
}
