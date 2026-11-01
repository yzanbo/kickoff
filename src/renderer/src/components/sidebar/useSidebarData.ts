import { useEffect, useState } from "react";
import type { ProjectSummary, Run, RunGroup } from "../../../../core/types";
import { api } from "../../api";
import { useServerEvent } from "../../events";

const byPosition = (a: RunGroup, b: RunGroup) => a.position - b.position || a.id - b.id;
const byUpdated = (a: Run, b: Run) => b.updated_at.localeCompare(a.updated_at);

/**
 * サイドバーに出す、プロジェクトごとのチャット（アーカイブしたものも含む）とグループ。
 * 全プロジェクトの分を先に読み込み、以降はサーバーからのイベントで更新する
 */
export function useSidebarData(projects: ProjectSummary[]) {
  const [runs, setRuns] = useState<Record<number, Run[]>>({});
  const [groups, setGroups] = useState<Record<number, RunGroup[]>>({});

  const ids = projects.map((p) => p.id).join(",");
  useEffect(() => {
    for (const p of projects) {
      if (runs[p.id]) continue;
      // アーカイブしたチャットも読み込み、一覧の下の「アーカイブ済み」に分けて出す
      void api.runs(p.id, { archived: true }).then((list) => setRuns((prev) => ({ ...prev, [p.id]: list })));
      void api.groups(p.id).then((list) => setGroups((prev) => ({ ...prev, [p.id]: list })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  useServerEvent((e) => {
    switch (e.type) {
      case "group":
        setGroups((prev) => {
          const list = [e.group, ...(prev[e.group.project_id] ?? []).filter((g) => g.id !== e.group.id)];
          return { ...prev, [e.group.project_id]: list.sort(byPosition) };
        });
        break;
      case "group_deleted":
        setGroups((prev) => ({ ...prev, [e.project_id]: (prev[e.project_id] ?? []).filter((g) => g.id !== e.id) }));
        break;
      case "run_deleted":
        setRuns((prev) => ({ ...prev, [e.project_id]: (prev[e.project_id] ?? []).filter((r) => r.id !== e.id) }));
        break;
      case "run":
        setRuns((prev) => {
          const list = prev[e.run.project_id] ?? [];
          return { ...prev, [e.run.project_id]: [e.run, ...list.filter((r) => r.id !== e.run.id)].sort(byUpdated) };
        });
        break;
    }
  });

  return { runs, groups };
}
