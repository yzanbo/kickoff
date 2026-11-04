import { useEffect, useState } from "react";
import type { Project } from "@shared/types";
import { api } from "@/api";
import { useServerEvent } from "@/api/events";
import { dropProject, removeGroup, upsertGroup, type GroupsByProject } from "./sidebarData";

/** 読み込みに失敗したあと、取り直すまでの間隔（サーバーが起動中・一時的に切れたときのため） */
const RETRY_MS = 5000;

/**
 * サイドバーに出す、プロジェクトごとのグループ（チャットはチャットの店 stores/chats.ts）。
 * 全プロジェクトの分を先に読み込み、以降はサーバーからのイベントで更新する。読み込みに失敗したら、しばらくして取り直す
 */
export function useSidebarData(projects: Project[]) {
  const [groups, setGroups] = useState<GroupsByProject>({});
  const [attempt, setAttempt] = useState(0);

  const ids = projects.map((p) => p.id).join(",");
  useEffect(() => {
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    for (const p of projects) {
      if (groups[p.id]) continue;
      api.groups(p.id).then(
        (list) => alive && setGroups((prev) => ({ ...prev, [p.id]: list })),
        () => (retry ??= setTimeout(() => alive && setAttempt((n) => n + 1), RETRY_MS)),
      );
    }
    return () => {
      alive = false;
      clearTimeout(retry);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, attempt]);

  useServerEvent((e) => {
    switch (e.type) {
      case "group":
        setGroups((prev) => upsertGroup(prev, e.group));
        break;
      case "group_deleted":
        setGroups((prev) => removeGroup(prev, e.project_id, e.id));
        break;
      case "project_deleted":
        setGroups((prev) => dropProject(prev, e.id));
        break;
    }
  });

  return { groups };
}
