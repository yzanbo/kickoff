// 端末（スマホ）から使える口。既定は「この Mac だけ」で、取り決めの access と、まだ取り決めに乗せていない口の表（下の 2 つ）に
// 書いたものだけを端末に開く（新しい口は、書き足すまで端末からは使えない。開いた口の一覧は test-records/core/device-routes.txt の記録。
// 届ける知らせの種類は、機能の SSE の表の access から組み立てが作る = ServeHooks.deviceMaySee）
import { TrieRouter } from "hono/router/trie-router";
import type { Method } from "@shared/foundation/contract";
import type { DeviceAccess } from "@shared/devices/types";
import { routeTable, type Mountable } from "./mount";

/** まだ取り決めに乗せていない口のうち、端末に開くもの（メソッドとパス。Hono のルートと同じ書き方。機能を取り決めに乗せたら、その行を消す） */
export const LEGACY_DEVICE_ROUTES: readonly (readonly [Method, string])[] = [
  // いま見ているもの（見ているチャットの知らせは通知しない）
  ["PUT", "/api/viewing"],
  // 自分（名前・できること）と、自分のプッシュの宛先を登録する・外す
  ["GET", "/api/devices/self"],
  ["PUT", "/api/devices/self/push"],
  // プロジェクト・グループ（見るだけ）
  ["GET", "/api/projects"],
  ["GET", "/api/projects/:id/groups"],
  // ターミナル（一覧・始める・止める・WebSocket でつなぐ。見るだけの端末は見るだけ）
  ["GET", "/api/terminals"],
  ["POST", "/api/projects/:id/terminals"],
  ["DELETE", "/api/terminals/:key"],
  ["GET", "/api/terminals/:key/ws"],
  // 添付・ツールの結果の画像
  ["POST", "/api/uploads"],
  ["GET", "/api/uploads/:id"],
  ["GET", "/api/chats/:id/tool-image"],
  // ノート（一覧・読む・書く・作る・動かす・ゴミ箱・ノートのチャット・探す）
  ["GET", "/api/notes/defaults"],
  ["GET", "/api/notes/users"],
  ["GET", "/api/notes/search"],
  ["GET", "/api/projects/:id/notes"],
  ["GET", "/api/projects/:id/note"],
  ["GET", "/api/projects/:id/note/file/*"],
  ["PUT", "/api/projects/:id/note"],
  ["DELETE", "/api/projects/:id/note"],
  ["POST", "/api/projects/:id/notes"],
  ["POST", "/api/projects/:id/notes/move"],
  ["POST", "/api/projects/:id/note/snapshot"],
  ["POST", "/api/projects/:id/note/chat"],
  ["POST", "/api/projects/:id/notes/ai-plan"],
  ["POST", "/api/projects/:id/notes/from-chat"],
];

/**
 * 「見るだけ」の端末も使える、GET のほかの口（見ているものの知らせ・自分のプッシュの宛先）。
 * どれも LEGACY_DEVICE_ROUTES にあるもので、チャット・送信待ち・承認などの中身は変えない（取り決めでは access: "deviceRead"）
 */
export const LEGACY_READ_ONLY_DEVICE_ROUTES: readonly (readonly [Method, string])[] = [
  ["PUT", "/api/viewing"],
  ["PUT", "/api/devices/self/push"],
];

/** 端末に開いた口 1 本（device = 見るだけの端末は GET だけ・deviceRead = 見るだけの端末も使える） */
export interface DeviceRoute {
  method: Method;
  path: string;
  access: "device" | "deviceRead";
}

/** 端末に開いた口の一覧（取り決めの access と、まだ乗せていない口の表を合わせたもの） */
export function deviceRoutes(routes: readonly Mountable[]): DeviceRoute[] {
  const readOnly = new Set(LEGACY_READ_ONLY_DEVICE_ROUTES.map(([m, p]) => `${m} ${p}`));
  return [
    ...routeTable(routes).flatMap(({ method, path, access }) => (access === "device" || access === "deviceRead" ? [{ method, path, access }] : [])),
    ...LEGACY_DEVICE_ROUTES.map(([method, path]) => ({ method, path, access: readOnly.has(`${method} ${path}`) ? ("deviceRead" as const) : ("device" as const) })),
  ];
}

/** 端末がその口を使えるか（ok / 端末に開いていない forbidden / 見るだけの端末なので使えない read_only。HEAD は GET として見る） */
export type DeviceMayUse = (method: string, path: string, access: DeviceAccess) => "ok" | "forbidden" | "read_only";

/** 受け口の一覧から、端末がその口を使えるかの判定を作る */
export function deviceAccess(routes: readonly Mountable[]): DeviceMayUse {
  const open = new TrieRouter<true>();
  const readOnly = new TrieRouter<true>();
  for (const r of deviceRoutes(routes)) {
    open.add(r.method, r.path, true);
    if (r.access === "deviceRead") readOnly.add(r.method, r.path, true);
  }
  return (method, path, access) => {
    const m = method === "HEAD" ? "GET" : method;
    if (open.match(m, path)[0].length === 0) return "forbidden";
    if (access === "full" || m === "GET" || readOnly.match(m, path)[0].length > 0) return "ok";
    return "read_only";
  };
}
