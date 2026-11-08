import { useEffect, useState } from "react";
import type { Project } from "@shared/types";
import { api } from "@/api";
import { useProjects } from "@/stores/projects";
import { useAppSettings } from "@/stores/settings";
import { memoOverlapLines } from "@/features/project/folderOverlaps";
import { OverlapList } from "@/features/project/OverlapNotice";

/**
 * メモフォルダがほかのプロジェクト（except を除く）と同じなら知らせる（被っていても使える。新しいプロジェクトのダイアログ・基本情報・プロジェクトの設定のメモ）。
 * 比べるのはコア（~ とリンクを解く）。入力中は少し待ち、プロジェクトの一覧・設定の親フォルダが変わったら調べ直す
 */
export function MemoOverlapNotice({ dir, except }: { dir: string | undefined; except?: number }) {
  return <OverlapList lines={memoOverlapLines(useMemoDirUsers(dir, except))} />;
}

function useMemoDirUsers(dir: string | undefined, except?: number): Project[] {
  const { projects, projectsById } = useProjects();
  const root = useAppSettings().data?.memos_dir;
  const [ids, setIds] = useState<number[]>([]);
  const target = dir?.trim() ?? "";
  useEffect(() => {
    if (!target) return setIds([]);
    let alive = true;
    const timer = setTimeout(() => {
      api
        .memoDirUsers(target, except)
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
