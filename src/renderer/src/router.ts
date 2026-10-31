import { useEffect, useState } from "react";
import { PHASES, type Phase } from "../../core/types";

export type Route =
  | { name: "home" }
  | { name: "settings" }
  | { name: "project"; id: number }
  | { name: "section"; projectId: number; section: Phase }
  | { name: "newChat"; projectId: number; section: Phase }
  | { name: "run"; projectId: number; runId: number };

function parse(hash: string): Route {
  const path = hash.replace(/^#/, "") || "/";
  if (path === "/settings") return { name: "settings" };
  const run = path.match(/^\/projects\/(\d+)\/runs\/(\d+)$/);
  if (run) return { name: "run", projectId: Number(run[1]), runId: Number(run[2]) };
  const newChat = path.match(/^\/projects\/(\d+)\/sections\/([a-z]+)\/new$/);
  if (newChat && (PHASES as readonly string[]).includes(newChat[2])) {
    return { name: "newChat", projectId: Number(newChat[1]), section: newChat[2] as Phase };
  }
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
    case "newChat":
      return `#/projects/${route.projectId}/sections/${route.section}/new`;
    case "run":
      return `#/projects/${route.projectId}/runs/${route.runId}`;
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

/** 画面がどのプロジェクトに属するか（サイドバーの強調表示用） */
export function routeProjectId(route: Route): number | undefined {
  if (route.name === "project") return route.id;
  if (route.name === "section" || route.name === "newChat" || route.name === "run") return route.projectId;
  return undefined;
}
