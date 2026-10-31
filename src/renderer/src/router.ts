import { useEffect, useState } from "react";
import { PHASES, type Phase } from "../../core/types";

export type Route =
  | { name: "home" }
  | { name: "settings" }
  | { name: "project"; id: number }
  | { name: "section"; projectId: number; section: Phase }
  | { name: "run"; projectId: number; runId: number };

function parse(hash: string): Route {
  const path = hash.replace(/^#/, "") || "/";
  if (path === "/settings") return { name: "settings" };
  const run = path.match(/^\/projects\/(\d+)\/runs\/(\d+)$/);
  if (run) return { name: "run", projectId: Number(run[1]), runId: Number(run[2]) };
  const section = path.match(/^\/projects\/(\d+)\/sections\/([a-z]+)$/);
  if (section && (PHASES as readonly string[]).includes(section[2])) {
    return { name: "section", projectId: Number(section[1]), section: section[2] as Phase };
  }
  const project = path.match(/^\/projects\/(\d+)$/);
  if (project) return { name: "project", id: Number(project[1]) };
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
      return `#/projects/${route.id}`;
    case "section":
      return `#/projects/${route.projectId}/sections/${route.section}`;
    case "run":
      return `#/projects/${route.projectId}/runs/${route.runId}`;
    default:
      return "#/";
  }
}

export function navigate(route: Route) {
  location.hash = href(route);
}

/** 画面がどのプロジェクトに属するか（サイドバーの強調表示用） */
export function routeProjectId(route: Route): number | undefined {
  if (route.name === "project") return route.id;
  if (route.name === "section" || route.name === "run") return route.projectId;
  return undefined;
}
