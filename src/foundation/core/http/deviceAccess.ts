// 端末（スマホ）から使える口。既定は「この Mac だけ」で、取り決めの access と、まだ取り決めに乗せていない口の表（下の LEGACY_DEVICE_ROUTES。見るだけの端末は GET だけ）に
// 書いたものだけを端末に開く（新しい口は、書き足すまで端末からは使えない。開いた口の一覧は test-records/core/device-routes.txt の記録。
// 届ける知らせの種類は、機能の SSE の表の access から組み立てが作る = ServeHooks.deviceMaySee）
import { TrieRouter } from "hono/router/trie-router";
import type { Method } from "@shared/foundation/contract";
import { routeTable, type Mountable } from "./mount";

/** まだ取り決めに乗せていない口のうち、端末に開くもの（メソッドとパス。Hono のルートと同じ書き方。機能を取り決めに乗せたら、その行を消す） */
export const LEGACY_DEVICE_ROUTES: readonly (readonly [Method, string])[] = [
  // 添付・ツールの結果の画像
  ["POST", "/api/uploads"],
  ["GET", "/api/uploads/:id"],
  ["GET", "/api/chats/:id/tool-image"],
];

/** 端末に開いた口 1 本（device = 見るだけの端末は GET だけ・deviceRead = 見るだけの端末も使える） */
export interface DeviceRoute {
  method: Method;
  path: string;
  access: "device" | "deviceRead";
}

/** 端末に開いた口の一覧（取り決めの access と、まだ乗せていない口の表を合わせたもの） */
export function deviceRoutes(routes: readonly Mountable[]): DeviceRoute[] {
  return [
    ...routeTable(routes).flatMap(({ method, path, access }) => (access === "device" || access === "deviceRead" ? [{ method, path, access }] : [])),
    ...LEGACY_DEVICE_ROUTES.map(([method, path]) => ({ method, path, access: "device" as const })),
  ];
}

/** 端末がその口を使えるか（ok / 端末に開いていない forbidden / 見るだけの端末（readOnly）なので使えない read_only。HEAD は GET として見る） */
export type DeviceMayUse = (method: string, path: string, readOnly: boolean) => "ok" | "forbidden" | "read_only";

/** 受け口の一覧から、端末がその口を使えるかの判定を作る */
export function deviceAccess(routes: readonly Mountable[]): DeviceMayUse {
  const open = new TrieRouter<true>();
  const readable = new TrieRouter<true>();
  for (const r of deviceRoutes(routes)) {
    open.add(r.method, r.path, true);
    if (r.access === "deviceRead") readable.add(r.method, r.path, true);
  }
  return (method, path, readOnly) => {
    const m = method === "HEAD" ? "GET" : method;
    if (open.match(m, path)[0].length === 0) return "forbidden";
    if (!readOnly || m === "GET" || readable.match(m, path)[0].length > 0) return "ok";
    return "read_only";
  };
}
