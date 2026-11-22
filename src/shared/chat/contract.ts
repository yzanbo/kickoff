// チャットの取り決め（チャットの資源・承認と質問）。受け口は src/features/chat/core/routes/（アーカイブの整理は @shared/trash/contract.ts）
import { empty, route, type Contract } from "@shared/foundation/contract";
import type { Approval, ApprovalDecisionBody } from "./approvalTypes";
import type { ChatDetail, ChatDetailQuery, ChatEventPage, ChatEventsQuery, ChatTexts, ChatTranscript } from "./detail";
import type { NewChatBody } from "./send";
import type { Chat, ChatPatch, FeedItem, GitHubLink, SearchHit } from "./types";

/** チャットの一覧の絞り込み（archived=1 でアーカイブ済みだけ。limit を省けばすべて。並びは最後に動いた順） */
type ChatListQuery = { archived?: "0" | "1"; limit?: number };

export const chatContract = {
  /** プロジェクトのチャット（絞り込みは全プロジェクトの一覧と同じ） */
  "GET /api/projects/:projectId/chats": route<never, Chat[], ChatListQuery>({ access: "device" }),
  /** 新しいチャットを始める（new_worktree_branch があれば本体のいまのコミットからワークツリーを作る） */
  "POST /api/projects/:projectId/chats": route<NewChatBody, Chat>({ status: 201, access: "device" }),
  /** GitHub の issue・PR を結び付ける（並び順は変えない） */
  "PUT /api/chats/:chatId/github": route<GitHubLink, Chat>(),
  /** GitHub の結び付きを外す */
  "DELETE /api/chats/:chatId/github": route<never, Chat>(),
  /** 手動の並び（サイドバーの並び順「手動順」）を ids の順にする。並べたチャットを並びの順に返す */
  "PUT /api/projects/:projectId/chats/order": route<{ ids: number[] }, Chat[]>(),
  /** チャットのやり取りのキーワード検索（⌘F） */
  "GET /api/search": route<never, SearchHit[], { q: string; project_id?: number; chat_id?: number; limit?: number }>({ access: "device" }),
  /** フィード（全プロジェクトの画面）: チャットごとのメインエージェントの最新の返答 1 件。返答の新しい順 */
  "GET /api/feed": route<never, FeedItem[], { limit?: number }>({ access: "device" }),
  /** 全プロジェクトのチャット（画面はこれを 1 回読み、あとは知らせで直す） */
  "GET /api/chats": route<never, Chat[], ChatListQuery>({ access: "device" }),
  /** チャットの詳細（作業中の様子 live は SSE の chat_live と同じ形。記録の読み方は ChatDetailQuery） */
  "GET /api/chats/:chatId": route<never, ChatDetail, ChatDetailQuery>({ access: "device" }),
  /** 記録の一部分（パソコンの画面が末尾の前を読み足す・遠い所の前後を読む・サブエージェントの中を読む） */
  "GET /api/chats/:chatId/events": route<never, ChatEventPage, ChatEventsQuery>(),
  /** チャットの中の検索で読む本文（before より前の自分の発言とメインエージェントの返答だけ） */
  "GET /api/chats/:chatId/texts": route<never, ChatTexts, { before: number }>(),
  /** チャットのやり取りの記録（Markdown。初めからすべて） */
  "GET /api/chats/:chatId/transcript": route<never, ChatTranscript>(),
  /** 名前・グループ・固定・アーカイブを変える（確かめを先にすべて済ませてから変える。作業中はアーカイブできない） */
  "PATCH /api/chats/:chatId": route<ChatPatch, Chat>({ access: "device" }),
  /** 確認した（未読を消す。event_id より新しい返答が届いていれば消さない） */
  "POST /api/chats/:chatId/seen": route<{ event_id?: number }, Chat>({ access: "deviceRead" }),
  /** 未読にする（次に開くまで残る） */
  "POST /api/chats/:chatId/unseen": route<never, Chat>({ access: "deviceRead" }),
  /** 削除 = Kickoff のゴミ箱へ（子孫・記録・会話記録・添付ごと。作業中のものがあれば 409）。入れたゴミ箱の ID（@shared/trash の TrashedResult と同じ形） */
  "DELETE /api/chats/:chatId": route<never, { trash_id: string }>(),
} as const satisfies Contract;

export const approvalContract = {
  /** 回答待ち（ツールの承認依頼・AI からの質問・再開するかの確かめ） */
  "GET /api/approvals": route<never, Approval[], { project_id?: number }>({ access: "device" }),
  /** 回答する（もう待っていなければ 409） */
  "POST /api/approvals/:approvalId": empty<ApprovalDecisionBody>({ access: "device" }),
} as const satisfies Contract;
