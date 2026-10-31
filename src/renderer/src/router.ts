import { useEffect, useState } from "react";
import { PHASES, type Phase } from "../../core/types";

export type Route =
  | { name: "home" }
  | { name: "settings" }
  | { name: "project"; id: number }
  | { name: "phase"; projectId: number; phase: Phase }
  | { name: "run"; projectId: number; runId: number };

function parse(hash: string): Route {
  const path = hash.replace(/^#/, "") || "/";
  if (path === "/settings") return { name: "settings" };
  const run = path.match(/^\/projects\/(\d+)\/runs\/(\d+)$/);
  if (run) return { name: "run", projectId: Number(run[1]), runId: Number(run[2]) };
  const phase = path.match(/^\/projects\/(\d+)\/phases\/([a-z]+)$/);
  if (phase && (PHASES as readonly string[]).includes(phase[2])) {
    return { name: "phase", projectId: Number(phase[1]), phase: phase[2] as Phase };
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
    case "phase":
      return `#/projects/${route.projectId}/phases/${route.phase}`;
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
  if (route.name === "phase" || route.name === "run") return route.projectId;
  return undefined;
}
