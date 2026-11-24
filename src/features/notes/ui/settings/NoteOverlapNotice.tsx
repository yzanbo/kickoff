import { useEffect, useState } from "react";
import type { Project } from "@shared/projects/types";
import { notesApi } from "@/features/notes/ui/api";
import { useAppSettings } from "@/foundation/ui/settings/appSettings";
import { InspectionList, noteOverlapLines, useProjects } from "@/features/projects/ui";

/**
 * ノートフォルダがほかのプロジェクト（except を除く）と同じなら知らせる（被っていても使える。新しいプロジェクトのダイアログ・基本情報・プロジェクトの設定のノート）。
 * 比べるのはコア（~ とリンクを解く）。入力中は少し待ち、プロジェクトの一覧・設定の親フォルダが変わったら調べ直す
 */
export function NoteOverlapNotice({ dir, except }: { dir: string | undefined; except?: number }) {
  return <InspectionList className="overlap-notice" items={noteOverlapLines(useNoteDirUsers(dir, except))} />;
}

function useNoteDirUsers(dir: string | undefined, except?: number): Project[] {
  const { projects, projectsById } = useProjects();
  const root = useAppSettings().data?.notes_dir;
  const [ids, setIds] = useState<number[]>([]);
  const target = dir?.trim() ?? "";
  useEffect(() => {
    if (!target) return setIds([]);
    let alive = true;
    const timer = setTimeout(() => {
      notesApi("GET /api/notes/users", { query: { path: target, except } })
        .then((r) => alive && setIds(r.project_ids))
        .catch(() => alive && setIds([]));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [target, except, projects, root]);
  return ids.flatMap((id) => projectsById.get(id) ?? []);
}
