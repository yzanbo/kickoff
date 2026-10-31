import { useEffect, useState } from "react";

export type Route = { name: "home" } | { name: "settings" };

function parse(hash: string): Route {
  const path = hash.replace(/^#/, "") || "/";
  if (path === "/settings") return { name: "settings" };
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
  return route.name === "settings" ? "#/settings" : "#/";
}
