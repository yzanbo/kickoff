// HTTP API の応答の形（コアのルートと画面で同じものを使う）。型のみ
import type { Approval } from "./approval";
import type { Chat } from "./chat";
import type { ChatEvent } from "./chatEvent";
import type { ChatLive, QueueState } from "./chatLive";

/** チャットの詳細（GET /api/chats/:id）。作業中の様子 live は SSE の chat_live と同じ形（あとはそれで追いかける） */
export interface ChatDetail {
  chat: Chat;
  events: ChatEvent[];
  /** このチャットの回答待ち（ツールの承認・AI からの質問・再開するかの確かめ） */
  approvals: Approval[];
  live: ChatLive;
}

/**
 * 次の指示を送った結果（POST /api/chats/:id/queue）。作業中なら送信待ちに入れ（queued と、入れた指示の id）、
 * 作業中でなければすぐ送る（queued: false・id: null）。どちらも、そのあとの送信待ち
 */
export interface QueueAddResult extends QueueState {
  queued: boolean;
  id: string | null;
}

/** 選んだ指示を送らずに 1 件にまとめた結果（POST /api/chats/:id/queue/merge）。id はまとめた 1 件、ほかはそのあとの送信待ち */
export interface QueueMergeResult extends QueueState {
  id: string;
}
