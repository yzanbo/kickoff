import { useEffect, useState } from "react";

export type Route = { name: "home" } | { name: "settings" } | { name: "project"; id: number };

function parse(hash: string): Route {
  const path = hash.replace(/^#/, "") || "/";
  if (path === "/settings") return { name: "settings" };
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
    default:
      return "#/";
  }
}

export function navigate(route: Route) {
  location.hash = href(route);
}
