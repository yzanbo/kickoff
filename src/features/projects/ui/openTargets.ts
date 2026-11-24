// プロジェクトの画面（タブ）を開く行き先（open({ kind: "projectView" })。⌘⇧F の検索・ノートのタブなど）
import type { OpenTargetHandler } from "@/foundation/ui/navigation/open";
import { navigate, type ProjectViewId } from "@/foundation/ui/navigation/router";

declare module "@/foundation/ui/navigation/open" {
  interface OpenTargetMap {
    /** プロジェクトの画面（view はタブの ID） */
    projectView: { projectId: number; view: ProjectViewId };
  }
}

export const projectViewTarget: OpenTargetHandler<"projectView"> = {
  kind: "projectView",
  open({ projectId, view }, { replace }) {
    navigate({ name: "project", id: projectId, tab: view }, { replace });
    return true;
  },
};
