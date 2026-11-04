import { useCallback, useEffect, useState } from "react";
import type { Approval, BusEvent, Project } from "@shared/types";
import { api } from "@/api";
import { useServerConnection } from "@/api/useServerConnection";
import { publishServerEvent } from "@/api/events";

/**
 * サーバーとつなぎ、アプリ全体で使うデータ（プロジェクト・回答待ち・設定の一部）を持つ。
 * 受け取ったイベントは onEvent と、各画面（useServerEvent）にも配る
 */
export function useAppData(onEvent: (event: BusEvent) => void) {
  const [projects, setProjects] = useState<Project[]>([]);
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
        setProjectsDir(s.projects_dir);
        setNotifyEnabled(s.desktop_notifications);
      })
      .catch(() => {});
    api.approvals().then(setApprovals).catch(() => {});
  }, [loadProjects]);

  const connection = useServerConnection((event) => {
    onEvent(event);
    publishServerEvent(event);
    switch (event.type) {
      case "project":
      case "project_deleted":
        loadProjects();
        break;
      case "approval":
        setApprovals((prev) => [...prev, event.approval]);
        break;
      case "approval_resolved":
        setApprovals((prev) => prev.filter((a) => a.id !== event.id));
        break;
      case "settings":
        setProjectsDir(event.settings.projects_dir);
        setNotifyEnabled(event.settings.desktop_notifications);
        break;
    }
  });

  return { projects, approvals, projectsDir, notifyEnabled, loadProjects, connection };
}
