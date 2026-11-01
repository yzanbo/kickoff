import { useEffect, useState } from "react";
import { BOARD_STAGES, PHASES, type BoardStage, type Phase } from "../../core/types";

export const PROJECT_TABS = ["board", "requirements", "schedule", "tasks", "reports", "settings"] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];

export type Route =
  | { name: "home" }
  | { name: "settings" }
  | { name: "project"; id: number; tab: ProjectTab }
  | { name: "newChat"; projectId: number; section?: Phase; stage?: BoardStage }
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
    return {
      name: "newChat",
      projectId: Number(newChat[1]),
      section: section && (PHASES as readonly string[]).includes(section) ? (section as Phase) : undefined,
      stage: stage && (BOARD_STAGES as readonly string[]).includes(stage) ? (stage as BoardStage) : undefined,
    };
  }

  const project = path.match(/^\/projects\/(\d+)(?:\/([a-z]+))?$/);
  if (project) {
    const tab = (PROJECT_TABS as readonly string[]).includes(project[2] ?? "") ? (project[2] as ProjectTab) : "board";
    return { name: "project", id: Number(project[1]), tab };
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
      return route.tab === "board" ? `#/projects/${route.id}` : `#/projects/${route.id}/${route.tab}`;
    case "newChat": {
      const q = new URLSearchParams();
      if (route.section) q.set("section", route.section);
      if (route.stage) q.set("stage", route.stage);
      return `#/projects/${route.projectId}/new${q.size ? `?${q}` : ""}`;
    }
    case "run":
      return `#/projects/${route.projectId}/runs/${route.runId}${route.focus ? `?event=${route.focus}` : ""}`;
    default:
      return "#/";
  }
}

export function navigate(route: Route, options: { replace?: boolean } = {}) {
  if (options.replace) {
    // 履歴に残さず置き換える（新しいチャット画面 → 作成されたチャットへ移るとき）
    history.replaceState(null, "", href(route));
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    location.hash = href(route);
  }
}

/** 画面がどのプロジェクトに属するか（サイドバーの強調表示や ⌘N 用） */
export function routeProjectId(route: Route): number | undefined {
  if (route.name === "project") return route.id;
  if (route.name === "newChat" || route.name === "run") return route.projectId;
  return undefined;
}
