import { useRef } from "react";
import type { Run, RunStatus } from "../../core/types";
import { chatTitle } from "./chatTitle";
import { BUSY_STATUSES } from "./components/RunStatus";
import { useServerEvent } from "./events";
import { openRun, type Route } from "./router";

/**
 * チャットの完了・失敗・回答待ちを、Mac の通知で知らせる。押すと Kickoff が前面に出て、そのチャットを開く。
 * Kickoff を見ていて、そのチャットを開いているときは知らせない
 */
/** projectName: プロジェクト名の引き当て（ProjectsContext の projectName） */
export function useRunNotifications({ enabled, projectName, route }: { enabled: boolean; projectName: (id: number) => string; route: Route }) {
  // チャットごとの直前の状態（作業中 → 完了 に変わったときだけ知らせる）
  const last = useRef(new Map<number, RunStatus>());
  const titles = useRef(new Map<number, string>());
  const state = useRef({ enabled, projectName, route });
  state.current = { enabled, projectName, route };

  const notify = (run: Pick<Run, "id" | "project_id">, title: string, body: string) => {
    const { enabled: on, route: current } = state.current;
    if (!on || typeof Notification === "undefined") return;
    const viewing = document.hasFocus() && current.name === "run" && current.runId === run.id;
    if (viewing) return;
    const n = new Notification(title, { body, silent: false });
    n.onclick = () => {
      void window.kickoff?.focusWindow();
      window.focus();
      openRun(run.project_id, run.id);
    };
  };

  useServerEvent((e) => {
    if (e.type === "run") {
      const run = e.run;
      titles.current.set(run.id, run.title);
      const prev = last.current.get(run.id);
      last.current.set(run.id, run.status);
      if (!prev || !BUSY_STATUSES.includes(prev) || BUSY_STATUSES.includes(run.status)) return;
      const project = state.current.projectName(run.project_id);
      const name = chatTitle(run.title);
      if (run.status === "completed") notify(run, `✓ 完了: ${name}`, `${project} ・ AI の作業が終わりました`);
      else if (run.status === "failed") notify(run, `✕ 失敗: ${name}`, `${project} ・ ${run.error?.slice(0, 120) ?? "エラーで止まりました"}`);
    } else if (e.type === "approval") {
      const a = e.approval;
      const project = state.current.projectName(a.project_id);
      const name = titles.current.get(a.run_id) || "チャット";
      const body =
        a.kind === "reconnect"
          ? "通信が切れて止まりました。再開するか選んでください"
          : a.kind === "usage_limit"
            ? "使用枠が戻りました。続きから再開するか選んでください"
            : "AI が確認を待っています";
      notify({ id: a.run_id, project_id: a.project_id }, `回答待ち: ${name}`, `${project} ・ ${body}`);
    }
  });
}
