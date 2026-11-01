import { useCallback, useEffect, useState } from "react";
import type { Approval, BusEvent, ProjectSummary } from "../../core/types";
import { api, useServerEvents } from "./api";
import { publishServerEvent } from "./events";

/**
 * サーバーとつなぎ、アプリ全体で使うデータ（プロジェクト・回答待ち・設定の一部）を持つ。
 * 受け取ったイベントは onEvent と、各画面（useServerEvent）にも配る
 */
export function useAppData(onEvent: (event: BusEvent) => void) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [projectsDir, setProjectsDir] = useState("~/Documents");
  // チャットの完了・失敗・回答待ちを Mac の通知で知らせるか（設定で切り替え）
  const [notifyEnabled, setNotifyEnabled] = useState(true);

  const loadProjects = useCallback(() => {
    api.projects().then(setProjects).catch(() => {});
  }, []);

  useEffect(() => {
    loadProjects();
    api
      .settings()
      .then((s) => {
        setProjectsDir(s.projectsDir);
        setNotifyEnabled(s.desktopNotifications);
      })
      .catch(() => {});
    api.approvals().then(setApprovals).catch(() => {});
  }, [loadProjects]);

  const connection = useServerEvents((event) => {
    onEvent(event);
    publishServerEvent(event);
    switch (event.type) {
      case "project":
      case "project_deleted":
      case "task":
      case "task_deleted":
      case "run":
        loadProjects();
        break;
      case "approval":
        setApprovals((prev) => [...prev, event.approval]);
        break;
      case "approval_resolved":
        setApprovals((prev) => prev.filter((a) => a.id !== event.id));
        break;
      case "settings":
        setProjectsDir(event.settings.projectsDir);
        setNotifyEnabled(event.settings.desktopNotifications);
        break;
    }
  });

  return { projects, approvals, projectsDir, notifyEnabled, loadProjects, connection };
}
