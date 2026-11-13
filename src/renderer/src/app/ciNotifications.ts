import { useEffect, useRef } from "react";
import type { CiFailure } from "@shared/types";
import { useServerEvent } from "@/api/events";
import { openCiRun } from "@/features/ci/ciLinks";
import type { Route } from "./router";

/**
 * CI の失敗（コアの見張りが、作業場所のブランチ・既定のブランチで落ちた実行を見つけた `ci_failed`）を Mac の通知で知らせる。
 * 押すと Kickoff が前に出て、そのプロジェクトの CI のタブでその実行を開く。設定の「通知」（desktop_notifications）に従い、
 * Kickoff を見ていて、そのプロジェクトの CI のタブを開いているときは知らせない（一覧がその場で取り直される）
 */
export function useCiFailureNotifications({ enabled, projectName, route }: { enabled: boolean; projectName: (id: number) => string; route: Route }) {
  const state = useRef({ enabled, projectName, route });
  state.current = { enabled, projectName, route };
  // メインプロセスの通知が押されたら、その実行を開く
  useEffect(() => window.kickoff?.notifications.onOpenCi((projectId, runId) => openCiRun(projectId, runId)), []);

  useServerEvent((e) => {
    if (e.type !== "ci_failed") return;
    const { enabled: on, projectName: nameOf, route: current } = state.current;
    const f: CiFailure = e.failure;
    if (!on || (!window.kickoff && typeof Notification === "undefined")) return;
    if (document.hasFocus() && current.name === "project" && current.id === f.project_id && current.tab === "ci") return;
    const title = `✕ CI が落ちました: ${f.branch}`;
    const body = `${nameOf(f.project_id)} ・ ${f.workflow} #${f.number}「${f.title}」`;
    if (window.kickoff) {
      void window.kickoff.notifications.notify({ title, body, ci: { projectId: f.project_id, runId: f.run_id } });
      return;
    }
    const n = new Notification(title, { body, silent: false });
    n.onclick = () => {
      window.focus();
      openCiRun(f.project_id, f.run_id);
    };
  });
}
