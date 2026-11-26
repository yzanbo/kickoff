// チャットの取り決め（チャットの資源・実行・送信待ち・承認と質問）。受け口は src/features/chat/core/routes/（アーカイブの整理は @shared/trash/contract.ts）
import { empty, route, type Contract } from "@shared/foundation/contract";
import type { Approval, ApprovalDecisionBody } from "./approvalTypes";
import type { ChatDetail, ChatDetailQuery, ChatEventPage, ChatEventsQuery, ChatTexts, ChatTranscript } from "./detail";
import type { FileRewindResult } from "@shared/ai/types";
import type { QueueState } from "./chatLive";
import type { NewChatBody, QueueCommandsBody, QueueEditingBody, QueueSendBody, SendBody, SendResult } from "./send";
import type { ReadTiming } from "./readTiming";
import type { Chat, ChatOptionsPatch, ChatPatch, FeedItem, GitHubLink, SearchHit } from "./types";

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
  /** 未読にする（次に開くまで残る。作業中・回答待ちは 409） */
  "POST /api/chats/:chatId/unseen": route<never, Chat>({ access: "deviceRead" }),
  /** スマホが読むチャットの設定（設定の全体は端末に開かないので、要る項目だけ。変えるのはパソコンの設定の画面） */
  "GET /api/chat-settings": route<never, { read_timing: ReadTiming }>({ access: "device" }),
  /** 削除 = Kickoff のゴミ箱へ（子孫・記録・会話記録・添付ごと。作業中のものがあれば 409）。入れたゴミ箱の ID（@shared/trash の TrashedResult と同じ形） */
  "DELETE /api/chats/:chatId": route<never, { trash_id: string }>(),
} as const satisfies Contract;

export const approvalContract = {
  /** 回答待ち（ツールの承認依頼・AI からの質問・再開するかの確かめ） */
  "GET /api/approvals": route<never, Approval[], { project_id?: number }>({ access: "device" }),
  /** 回答する（もう待っていなければ 409） */
  "POST /api/approvals/:approvalId": empty<ApprovalDecisionBody>({ access: "device" }),
} as const satisfies Contract;

/** 巻き戻して送り直す（自分の発言の手前まで。restore_files ならファイルもその発言を送る前に戻す） */
type RewindBody = { event_id: number; text?: string; options?: ChatOptionsPatch; restore_files?: boolean };

export const chatTurnContract = {
  /** 送る口 1 本（when: now = 止めずに伝える / later = 作業中なら送信待ちへ。答えは SendResult）。when を省けば前からの続きを送る口（作業中なら 409。答えはチャット） */
  "POST /api/chats/:chatId/messages": route<SendBody, Chat | SendResult>({ access: "device" }),
  /** 止める（変わった様子は SSE の chat_live で届く） */
  "POST /api/chats/:chatId/cancel": empty({ access: "device" }),
  /** 通信が切れて止まったチャットを、つながったら自動で再開するのをやめる（待っていなければ 409） */
  "DELETE /api/chats/:chatId/reconnect": empty({ access: "device" }),
  /** 裏で動いている作業を 1 つ止める（サブエージェント・コマンド。作業中でなければ 409） */
  "POST /api/chats/:chatId/background/:taskId/stop": empty({ access: "device" }),
  /** 自分の発言の手前まで巻き戻して、書き直した文で送り直す（作業中は 409、巻き戻せない発言・ファイルを戻せないときは 400） */
  "POST /api/chats/:chatId/rewind": route<RewindBody, Chat>(),
  /** ファイルだけを、自分の発言を送る前の状態に戻す（dry_run なら戻さずに、変わるファイルと行の増減だけ） */
  "POST /api/chats/:chatId/rewind-files": route<{ event_id: number; dry_run?: boolean }, FileRewindResult>(),
} as const satisfies Contract;

/** 送信待ち（作業中のチャットに送った次の指示の列）と預かり。応答はどれも、変えたあとの送信待ち（SSE の chat_live の queue と同じ形）。列にない指示は 404、送るものがないなどの状態は 409 */
export const chatQueueContract = {
  /** 送信待ち・預かりを変える命令の列（全部通るか 1 つも変えない。預かりの行を外す・書き直すのは、いまの作業に足している途中なら 409） */
  "POST /api/chats/:chatId/queue": route<QueueCommandsBody, QueueState>({ access: "device" }),
  /** 画面でいま書き直している待ちの指示（丸ごと置き換え、空なら外す。lane: now なら預かった指示。持ち時間より短い間隔で知らせ直す） */
  "PUT /api/chats/:chatId/queue/editing": route<QueueEditingBody, QueueState>({ access: "device" }),
  /** 送信待ちをすぐ送る（now = その 1 件 / all = まとめて 1 件に / in_order = 1 件ずつ順に） */
  "POST /api/chats/:chatId/queue/send": route<QueueSendBody, QueueState>({ access: "device" }),
} as const satisfies Contract;
