import type { Chat, ChatDetachBody, ChatDetail, ChatDetailQuery, ChatPatch, ChatTranscript, FeedItem, NewChatBody, SearchHit, TrashedResult } from "@shared/types";
import { request, withQuery } from "./http";

const patchChat = (chatId: number, patch: ChatPatch) => request<Chat>("PATCH", `/api/chats/${chatId}`, patch);

/** チャット（一覧・始める・詳細・名前・グループ・固定・アーカイブ・既読・移動・削除）と、やり取りの検索（コアの routes/chats.ts） */
export const chatsApi = {
  /**
   * 全プロジェクトのチャット（最後に動いた順にすべて。画面はチャットの店 stores/chats.ts で 1 回だけ読み、あとは知らせで直す）。
   * archived: アーカイブ済みだけ（省けばアーカイブしていないものだけ）
   */
  allChats: (opts: { archived?: boolean } = {}) => request<Chat[]>("GET", withQuery("/api/chats", { archived: opts.archived })),
  /** チャットのやり取り（自分の発言と AI の返答）の全文検索。scope で、そのプロジェクト・チャットだけに絞る */
  search: (q: string, scope: { projectId?: number; chatId?: number } = {}) =>
    request<SearchHit[]>("GET", withQuery("/api/search", { q, project_id: scope.projectId, chat_id: scope.chatId })),
  /** フィード（全プロジェクトの画面）: チャットごとのメインエージェントの最新の返答 1 件の初めの部分。返答の新しい順 */
  feed: (limit?: number) => request<FeedItem[]>("GET", withQuery("/api/feed", { limit })),
  startChat: (projectId: number, body: NewChatBody) => request<Chat>("POST", `/api/projects/${projectId}/chats`, body),
  /** チャットの詳細（記録・回答待ち・作業中の様子。作業中の様子は SSE の chat_live で追いかける） */
  /** チャットの詳細（query を省けば記録はすべて。つなぎ直したときは after で切れていた間の分だけ） */
  chatDetail: (id: number, query: ChatDetailQuery = {}) => request<ChatDetail>("GET", withQuery(`/api/chats/${id}`, { ...query })),
  /** チャットのやり取りの記録（自分の発言と AI の返答を古い順に並べた Markdown。右クリックの「全部のやり取りをコピー」） */
  chatTranscriptMarkdown: (id: number) => request<ChatTranscript>("GET", `/api/chats/${id}/transcript`),
  // 名前・グループ・固定・アーカイブはどれも PATCH（プロジェクトと同じ形）
  renameChat: (chatId: number, title: string) => patchChat(chatId, { title }),
  pinChat: (chatId: number, pinned: boolean) => patchChat(chatId, { pinned }),
  archiveChat: (chatId: number, archived = true) => patchChat(chatId, { archived }),
  setChatGroup: (chatId: number, groupId: number | null) => patchChat(chatId, { group_id: groupId }),
  /** eventId: 一番下まで見た記録（それより新しい返答があれば、未読のまま） */
  markSeen: (chatId: number, eventId?: number) => request<Chat>("POST", `/api/chats/${chatId}/seen`, eventId === undefined ? undefined : { event_id: eventId }),
  markUnseen: (chatId: number) => request<Chat>("POST", `/api/chats/${chatId}/unseen`),
  /** チャットを別のプロジェクトへ移す（グループ・作業場所は外れ、移した先の本体で作業する。会話は続く） */
  /** 手動の並び（サイドバーの並び順「手動順」）を ids の順にする（並べたチャットが並びの順に返る） */
  reorderChats: (projectId: number, ids: number[]) => request<Chat[]>("PUT", `/api/projects/${projectId}/chats/order`, { ids }),
  /** 子チャットを親から外す（parent_chat_id: null = 親のないチャット（group_id のグループへ）/ 先祖の ID = その子に上げる） */
  detachChat: (chatId: number, body: ChatDetachBody) => request<Chat>("POST", `/api/chats/${chatId}/detach`, body),
  moveChat: (chatId: number, projectId: number) => request<Chat>("POST", `/api/chats/${chatId}/move`, { project_id: projectId }),
  /** チャットを Kickoff のゴミ箱へ入れる（子チャットも。3 日は戻せる）。入れたゴミ箱の ID を返す */
  deleteChat: (chatId: number) => request<TrashedResult>("DELETE", `/api/chats/${chatId}`),
};
