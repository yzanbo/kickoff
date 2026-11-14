// 端末（スマホ）から使える口と、届ける知らせ。既定は「この Mac だけ」で、ここに書いたものだけを端末に開く
// （新しい口・知らせの種類は、書き足すまで端末からは使えない。口の名前を変えたら、ここも直す = server.devices.test.ts が確かめる）
import { TrieRouter } from "hono/router/trie-router";
import type { BusEvent, DeviceAccess } from "@shared/types";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** 端末に開く口（メソッドとパス。Hono のルートと同じ書き方） */
export const DEVICE_ROUTES: readonly (readonly [Method, string])[] = [
  // 接続・状態・知らせ
  ["GET", "/api/health"],
  ["GET", "/api/status"],
  ["GET", "/api/events"],
  // いま見ているもの（見ているチャットの知らせは通知しない）
  ["PUT", "/api/viewing"],
  // 自分（名前・できること）と、自分のプッシュの宛先を登録する・外す
  ["GET", "/api/devices/self"],
  ["PUT", "/api/devices/self/push"],
  // プロジェクト・グループ（見るだけ）
  ["GET", "/api/projects"],
  ["GET", "/api/projects/:id"],
  ["GET", "/api/projects/:id/groups"],
  // チャット（一覧・中身・作る・名前と固定・既読・探す）
  ["GET", "/api/projects/:id/chats"],
  ["POST", "/api/projects/:id/chats"],
  ["GET", "/api/chats"],
  ["GET", "/api/chats/:id"],
  ["PATCH", "/api/chats/:id"],
  ["POST", "/api/chats/:id/seen"],
  ["POST", "/api/chats/:id/unseen"],
  ["GET", "/api/search"],
  ["GET", "/api/feed"],
  // 送る・伝える・止める・圧縮・消去・再開をやめる・裏の作業を止める・圧縮が終わるまでの預かり・子チャット・親に渡す
  ["POST", "/api/chats/:id/messages"],
  ["POST", "/api/chats/:id/tell"],
  ["POST", "/api/chats/:id/cancel"],
  ["POST", "/api/chats/:id/compact"],
  ["POST", "/api/chats/:id/clear"],
  ["DELETE", "/api/chats/:id/reconnect"],
  ["POST", "/api/chats/:id/background/:taskId/stop"],
  ["DELETE", "/api/chats/:id/after-compact/:messageId"],
  ["PATCH", "/api/chats/:id/after-compact/:messageId"],
  ["PUT", "/api/chats/:id/after-compact/editing"],
  ["POST", "/api/chats/:id/children"],
  ["POST", "/api/chats/:id/subagents/:agentId/children"],
  ["POST", "/api/chats/:id/handoff"],
  // 送信待ち
  ["GET", "/api/queue-resumes"],
  ["POST", "/api/queue-resumes"],
  ["POST", "/api/chats/:id/queue"],
  ["DELETE", "/api/chats/:id/queue"],
  ["PUT", "/api/chats/:id/queue/stop-after"],
  ["PUT", "/api/chats/:id/queue/stops"],
  ["PUT", "/api/chats/:id/queue/paused"],
  ["PUT", "/api/chats/:id/queue/editing"],
  ["DELETE", "/api/chats/:id/queue/:queueId"],
  ["PATCH", "/api/chats/:id/queue/:queueId"],
  ["POST", "/api/chats/:id/queue/:queueId/move"],
  ["POST", "/api/chats/:id/queue/:queueId/send"],
  ["POST", "/api/chats/:id/queue/send-all"],
  ["POST", "/api/chats/:id/queue/merge"],
  ["POST", "/api/chats/:id/queue/send-in-order"],
  ["POST", "/api/chats/:id/queue/remove-many"],
  ["POST", "/api/chats/:id/queue/move-many"],
  // ターミナル（一覧・始める・止める・WebSocket でつなぐ。2026-11-14 に利用者と決めた。見るだけの端末は見るだけ）
  ["GET", "/api/terminals"],
  ["POST", "/api/projects/:id/terminals"],
  ["DELETE", "/api/terminals/:key"],
  ["GET", "/api/terminals/:key/ws"],
  // 承認・質問への回答
  ["GET", "/api/approvals"],
  ["POST", "/api/approvals/:id"],
  // 添付・ツールの結果の画像
  ["POST", "/api/uploads"],
  ["GET", "/api/uploads/:id"],
  ["GET", "/api/chats/:id/tool-image"],
  // メモ（2026-11-14 に利用者と決めた。一覧・読む・書く・作る・動かす・ゴミ箱・メモのチャット・探す）
  ["GET", "/api/memos/defaults"],
  ["GET", "/api/memos/users"],
  ["GET", "/api/memos/search"],
  ["GET", "/api/projects/:id/memos"],
  ["GET", "/api/projects/:id/memo"],
  ["GET", "/api/projects/:id/memo/file/*"],
  ["PUT", "/api/projects/:id/memo"],
  ["DELETE", "/api/projects/:id/memo"],
  ["POST", "/api/projects/:id/memos"],
  ["POST", "/api/projects/:id/memos/move"],
  ["POST", "/api/projects/:id/memo/snapshot"],
  ["POST", "/api/projects/:id/memo/chat"],
  ["POST", "/api/projects/:id/memos/ai-plan"],
  ["POST", "/api/projects/:id/memos/from-chat"],
];

/**
 * 「見るだけ」の端末も使える、GET のほかの口（見ているものの知らせ・自分のプッシュの宛先・既読と未読の印）。
 * どれも DEVICE_ROUTES にあるもので、チャット・送信待ち・承認などの中身は変えない
 */
export const READ_ONLY_DEVICE_ROUTES: readonly (readonly [Method, string])[] = [
  ["PUT", "/api/viewing"],
  ["PUT", "/api/devices/self/push"],
  ["POST", "/api/chats/:id/seen"],
  ["POST", "/api/chats/:id/unseen"],
];

const routerOf = (routes: readonly (readonly [Method, string])[]) => {
  const router = new TrieRouter<true>();
  for (const [method, path] of routes) router.add(method, path, true);
  return router;
};
const deviceRouter = routerOf(DEVICE_ROUTES);
const readOnlyRouter = routerOf(READ_ONLY_DEVICE_ROUTES);

/** 端末がその口を使えるか（ok / 端末に開いていない forbidden / 見るだけの端末なので使えない read_only。HEAD は GET として見る） */
export function deviceMayUse(method: string, path: string, access: DeviceAccess = "full"): "ok" | "forbidden" | "read_only" {
  const m = method === "HEAD" ? "GET" : method;
  if (deviceRouter.match(m, path)[0].length === 0) return "forbidden";
  if (access === "full" || m === "GET" || readOnlyRouter.match(m, path)[0].length > 0) return "ok";
  return "read_only";
}

/** 端末に届ける知らせの種類（開いた口の中身が変わったもの。この Mac の画面への頼み・閉じた口の知らせは届けない） */
const DEVICE_EVENT_TYPES = new Set<BusEvent["type"]>([
  "project",
  "project_deleted",
  "group",
  "group_deleted",
  "chat",
  "chat_deleted",
  "chat_event",
  "chat_events_deleted",
  "chat_delta",
  "chat_subagent",
  "chat_command_output",
  "chat_live",
  "approval",
  "approval_resolved",
  "memos",
]);

/** 端末に届けてよい知らせか */
export const deviceMaySee = (event: BusEvent): boolean => DEVICE_EVENT_TYPES.has(event.type);
