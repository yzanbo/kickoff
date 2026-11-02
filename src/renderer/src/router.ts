import { createContext, useContext, useState } from "react";
import { PHASES, type Phase } from "../../core/types";
import { useWindowEvent } from "./hooks/useWindowEvent";

// プロジェクトの設定は、タブではなくプロジェクト名の横の「編集」から開く
const PROJECT_TABS = ["board", "groups", "requirements", "schedule", "tasks", "reports", "changes"] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];

export type Route =
  /** 全プロジェクト（全プロジェクトのチャットのカンバン。URL は #/） */
  | { name: "allProjects" }
  /** group: グループのタブで、表示して目立たせるグループ（サイドバーのグループ名から来たとき） */
  | { name: "project"; id: number; tab: ProjectTab; group?: number }
  | { name: "newChat"; projectId: number; section?: Phase; group?: number }
  /** focus: 検索結果から開いたとき、スクロールして強調する発言（イベント ID） */
  | { name: "run"; projectId: number; runId: number; focus?: number };

/** URL のハッシュを画面に読む（知らない形は全プロジェクト） */
export function parse(hash: string): Route {
  const [path, query = ""] = (hash.replace(/^#/, "") || "/").split("?");
  const params = new URLSearchParams(query);

  const run = path.match(/^\/projects\/(\d+)\/runs\/(\d+)$/);
  if (run) {
    const focus = Number(params.get("event"));
    return { name: "run", projectId: Number(run[1]), runId: Number(run[2]), ...(focus ? { focus } : {}) };
  }

  const newChat = path.match(/^\/projects\/(\d+)\/new$/);
  if (newChat) {
    const section = params.get("section");
    const group = Number(params.get("group"));
    return {
      name: "newChat",
      projectId: Number(newChat[1]),
      section: section && (PHASES as readonly string[]).includes(section) ? (section as Phase) : undefined,
      ...(Number.isInteger(group) && group > 0 ? { group } : {}),
    };
  }

  const project = path.match(/^\/projects\/(\d+)(?:\/([a-z]+))?$/);
  if (project) {
    const tab = (PROJECT_TABS as readonly string[]).includes(project[2] ?? "") ? (project[2] as ProjectTab) : "board";
    const group = Number(params.get("group"));
    return { name: "project", id: Number(project[1]), tab, ...(tab === "groups" && Number.isInteger(group) && group > 0 ? { group } : {}) };
  }
  return { name: "allProjects" };
}

/**
 * ハッシュベースの簡易ルーター（Electron とスマホのブラウザの両方で動く）。
 * URL の購読は App の 1 回だけ（useHashRoute）で、部品は RouteContext から useRoute() で読む（route を props で中継しない）
 */
export function useHashRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useWindowEvent("hashchange", () => setRoute(parse(location.hash)));
  return route;
}

export const RouteContext = createContext<Route>({ name: "allProjects" });

/** いまの画面（App が入れた RouteContext） */
export const useRoute = () => useContext(RouteContext);

export function href(route: Route): string {
  switch (route.name) {
    case "project":
      return route.tab === "board"
        ? `#/projects/${route.id}`
        : `#/projects/${route.id}/${route.tab}${route.group ? `?group=${route.group}` : ""}`;
    case "newChat": {
      const q = new URLSearchParams();
      if (route.section) q.set("section", route.section);
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
export function openNewChat(projectId: number, target: { section?: Phase; group?: number } = {}) {
  navigate({ name: "newChat", projectId, ...target });
}

/** 画面がどのプロジェクトに属するか（サイドバーの強調表示や ⌘N 用） */
export function routeProjectId(route: Route): number | undefined {
  if (route.name === "project") return route.id;
  if (route.name === "newChat" || route.name === "run") return route.projectId;
  return undefined;
}
