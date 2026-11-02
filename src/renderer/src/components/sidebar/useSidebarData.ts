import { useEffect, useState } from "react";
import type { ProjectSummary } from "../../../../core/types";
import { api } from "../../api";
import { errorMessage } from "../../errors";
import { useServerEvent } from "../../events";
import { dropProject, removeGroup, removeRun, upsertGroup, upsertRun, type GroupsByProject, type RunsByProject } from "./sidebarData";

/** 読み込みに失敗したあと、取り直すまでの間隔（サーバーが起動中・一時的に切れたときのため） */
const RETRY_MS = 5000;

/**
 * サイドバーに出す、プロジェクトごとのチャット（アーカイブしたものも含む）とグループ。
 * 全プロジェクトの分を先に読み込み、以降はサーバーからのイベントで更新する。
 * 読み込みに失敗したプロジェクトは errors に記録し、しばらくして取り直す（失敗したまま空にしない）
 */
export function useSidebarData(projects: ProjectSummary[]) {
  const [runs, setRuns] = useState<RunsByProject>({});
  const [groups, setGroups] = useState<GroupsByProject>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [attempt, setAttempt] = useState(0);

  const ids = projects.map((p) => p.id).join(",");
  useEffect(() => {
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const failed = (projectId: number) => (e: unknown) => {
      if (!alive) return;
      setErrors((prev) => ({ ...prev, [projectId]: errorMessage(e) }));
      retry ??= setTimeout(() => alive && setAttempt((n) => n + 1), RETRY_MS);
    };
    const clearError = (projectId: number) => setErrors((prev) => dropProject(prev, projectId));
    for (const p of projects) {
      // アーカイブしたチャットも読み込み、一覧の下の「アーカイブ済み」に分けて出す
      if (!runs[p.id]) {
        api.runs(p.id, { archived: true }).then((list) => {
          if (!alive) return;
          setRuns((prev) => ({ ...prev, [p.id]: list }));
          clearError(p.id);
        }, failed(p.id));
      }
      if (!groups[p.id]) {
        api.groups(p.id).then((list) => alive && setGroups((prev) => ({ ...prev, [p.id]: list })), failed(p.id));
      }
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
      case "run_deleted":
        setRuns((prev) => removeRun(prev, e.project_id, e.id));
        break;
      case "run":
        setRuns((prev) => upsertRun(prev, e.run));
        break;
      case "project_deleted":
        setRuns((prev) => dropProject(prev, e.id));
        setGroups((prev) => dropProject(prev, e.id));
        setErrors((prev) => dropProject(prev, e.id));
        break;
    }
  });

  return { runs, groups, errors };
}
