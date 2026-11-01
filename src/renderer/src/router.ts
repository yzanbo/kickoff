import { useEffect, useState } from "react";
import { BOARD_STAGES, PHASES, type BoardStage, type Phase } from "../../core/types";

// プロジェクトの設定は、タブではなくプロジェクト名の横の「編集」から開く
export const PROJECT_TABS = ["board", "groups", "requirements", "schedule", "tasks", "reports"] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];

export type Route =
  | { name: "home" }
  | { name: "settings" }
  /** group: グループのタブで、表示して目立たせるグループ（サイドバーのグループ名から来たとき） */
  | { name: "project"; id: number; tab: ProjectTab; group?: number }
  | { name: "newChat"; projectId: number; section?: Phase; stage?: BoardStage; group?: number }
  /** focus: 検索結果から開いたとき、スクロールして強調する発言（イベント ID） */
  | { name: "run"; projectId: number; runId: number; focus?: number };

function parse(hash: string): Route {
  const [path, query = ""] = (hash.replace(/^#/, "") || "/").split("?");
  const params = new URLSearchParams(query);
  if (path === "/settings") return { name: "settings" };

  const run = path.match(/^\/projects\/(\d+)\/runs\/(\d+)$/);
  if (run) {
    const focus = Number(params.get("event"));
    return { name: "run", projectId: Number(run[1]), runId: Number(run[2]), ...(focus ? { focus } : {}) };
  }

  const newChat = path.match(/^\/projects\/(\d+)\/new$/);
  if (newChat) {
    const section = params.get("section");
    const stage = params.get("stage");
    const group = Number(params.get("group"));
    return {
      name: "newChat",
      projectId: Number(newChat[1]),
      section: section && (PHASES as readonly string[]).includes(section) ? (section as Phase) : undefined,
      stage: stage && (BOARD_STAGES as readonly string[]).includes(stage) ? (stage as BoardStage) : undefined,
      ...(Number.isInteger(group) && group > 0 ? { group } : {}),
    };
  }

  const project = path.match(/^\/projects\/(\d+)(?:\/([a-z]+))?$/);
  if (project) {
    const tab = (PROJECT_TABS as readonly string[]).includes(project[2] ?? "") ? (project[2] as ProjectTab) : "board";
    const group = Number(params.get("group"));
    return { name: "project", id: Number(project[1]), tab, ...(tab === "groups" && Number.isInteger(group) && group > 0 ? { group } : {}) };
  }
  return { name: "home" };
}

/** ハッシュベースの簡易ルーター（Electron とスマホのブラウザの両方で動く） */
export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function href(route: Route): string {
  switch (route.name) {
    case "settings":
      return "#/settings";
    case "project":
      return route.tab === "board"
        ? `#/projects/${route.id}`
        : `#/projects/${route.id}/${route.tab}${route.group ? `?group=${route.group}` : ""}`;
    case "newChat": {
      const q = new URLSearchParams();
      if (route.section) q.set("section", route.section);
      if (route.stage) q.set("stage", route.stage);
      if (route.group) q.set("group", String(route.group));
      return `#/projects/${route.projectId}/new${q.size ? `?${q}` : ""}`;
    }
    case "run":
      return `#/projects/${route.projectId}/runs/${route.runId}${route.focus ? `?event=${route.focus}` : ""}`;
    default:
      return "#/";
  }
}

export function navigate(route: Route, options: { replace?: boolean } = {}) {
  if (location.hash === href(route) && (route.name === "run" || route.name === "newChat")) {
    window.dispatchEvent(new CustomEvent<ReopenRoute>(REOPEN_EVENT, { detail: route }));
    return;
  }
  if (options.replace) {
    // 履歴に残さず置き換える（新しいチャット画面 → 作成されたチャットへ移るとき）
    history.replaceState(null, "", href(route));
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    location.hash = href(route);
  }
}

/**
 * チャット・新しいチャットはプロジェクトのカンバンの右側のパネルで開く（単体の画面はない）。
 * 同じものを開き直したときは URL が変わらないので、このイベントでパネルに知らせる
 */
export const REOPEN_EVENT = "kickoff:reopen";
export type ReopenRoute = Extract<Route, { name: "run" } | { name: "newChat" }>;

/** チャットを開く（プロジェクトのカンバンへ移り、右側のパネルで開く） */
export function openRun(projectId: number, runId: number, focus?: number, options: { replace?: boolean } = {}) {
  navigate({ name: "run", projectId, runId, ...(focus ? { focus } : {}) }, options);
}

/** 新しいチャットを始める（プロジェクトのカンバンへ移り、右側のパネルで始める） */
export function openNewChat(projectId: number, target: { section?: Phase; stage?: BoardStage; group?: number } = {}) {
  navigate({ name: "newChat", projectId, ...target });
}

/** 画面がどのプロジェクトに属するか（サイドバーの強調表示や ⌘N 用） */
export function routeProjectId(route: Route): number | undefined {
  if (route.name === "project") return route.id;
  if (route.name === "newChat" || route.name === "run") return route.projectId;
  return undefined;
}
