// 端末（スマホ）から使える口と、届ける知らせ。既定は「この Mac だけ」で、ここに書いたものだけを端末に開く
// （新しい口・知らせの種類は、書き足すまで端末からは使えない。口の名前を変えたら、ここも直す = server.devices.test.ts が確かめる）
import { TrieRouter } from "hono/router/trie-router";
import type { BusEvent } from "@shared/types";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** 端末に開く口（メソッドとパス。Hono のルートと同じ書き方） */
export const DEVICE_ROUTES: readonly (readonly [Method, string])[] = [
  // 接続・状態・知らせ
  ["GET", "/api/health"],
  ["GET", "/api/status"],
  ["GET", "/api/events"],
  // いま見ているもの（見ているチャットの知らせは通知しない）
  ["PUT", "/api/viewing"],
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

const router = new TrieRouter<true>();
for (const [method, path] of DEVICE_ROUTES) router.add(method, path, true);

/** 端末が使ってよい口か（HEAD は GET として見る） */
export function deviceMayUse(method: string, path: string): boolean {
  const [matches] = router.match(method === "HEAD" ? "GET" : method, path);
  return matches.length > 0;
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
